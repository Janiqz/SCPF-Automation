const QuotaNotificationService=require('./QuotaNotificationService');
const {PermissionsBitField,ChannelType}=require('discord.js');
const clean=(v,max=1000)=>String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/@/g,'@\u200b').slice(0,max);
class LogDispatchService extends QuotaNotificationService{
 constructor(client,options={}){super(client,options);this.intervalMs=30000;this.lastSync=0;this.syncing=false;}
 endpoint(){return this.apiUrl+'/api/internal/logging/dispatch';}
 async syncChannels(){
  if(Date.now()-this.lastSync<15*60000)return;
  const headers={Authorization:`Bearer ${this.secret}`};
  const {data}=await this.http.get(this.apiUrl+'/api/internal/logging/channels',{headers,timeout:15000});
  for(const department of data.departments||[]){
   try{const guild=await this.client.guilds.fetch(department.guildId),channels=await guild.channels.fetch();const rows=[...channels.values()].filter(c=>c&&[ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(c.type)).map(c=>({id:c.id,name:c.name,type:c.type}));await this.http.post(this.apiUrl+'/api/internal/logging/channels',{departmentId:department.id,channels:rows},{headers,timeout:15000});}
   catch(error){console.warn('[Logs] Could not sync department channels:',department.id,error.message);}
  }
  this.lastSync=Date.now();
 }
 buildMessage(job){
  const entry=job.payload.entry,template=job.payload.template,fields=[];let budget=3900;const panelUrl=this.apiUrl+'/logging?entry='+encodeURIComponent(entry.id);
  const full=[template.name,job.departmentName,'Filed by: '+(entry.created_by_roblox_username||entry.created_by_name),'Target: '+(entry.target_roblox_username||'No target')+(entry.target_roblox_user_id?' ('+entry.target_roblox_user_id+')':''),'Filed at: '+entry.created_at,'Log ID: '+entry.id,''];
  for(const field of template.fields||[]){const raw=entry.values?.[field.id];const value=typeof raw==='boolean'?(raw?'Yes':'No'):String(raw??'Not provided');full.push(field.label+':',value,'');if(fields.length<22&&budget>150){const label=clean(field.label,200),text=clean(value,Math.min(900,budget-label.length))||'Not provided';fields.push({name:label,value:text,inline:false});budget-=label.length+text.length;}}
  const target=entry.target_roblox_username?clean(entry.target_roblox_username,60)+' ('+entry.target_roblox_user_id+')':'No target';
  return {components:[{type:1,components:[{type:2,style:5,label:'View log on panel',url:panelUrl}]}],embeds:[{url:panelUrl,title:clean(template.name,100),description:clean(template.description,350)||undefined,color:/^#[\da-f]{6}$/i.test(template.color)?parseInt(template.color.slice(1),16):0x8b0000,fields:[{name:'Filed by',value:clean(entry.created_by_roblox_username||entry.created_by_name,100)||'Unknown',inline:true},{name:'Personnel',value:target,inline:true},...fields],footer:{text:clean(job.departmentName,100)+' · Full log attached · '+entry.id},timestamp:entry.created_at}],files:[{attachment:Buffer.from(full.join('\n'),'utf8'),name:'department-log-'+entry.id+'.txt'}],allowedMentions:{parse:[]},nonce:BigInt('0x'+entry.id.replaceAll('-','').slice(0,16)).toString(),enforceNonce:true};
 }
 async deliver(job){
  if(job.action==='delete'){
   try{const channel=await this.client.channels.fetch(job.channel_id);if(channel?.guildId===job.guildId&&channel.messages){const message=await channel.messages.fetch(job.message_id);if(message?.author?.id===this.client.user?.id)await message.delete();}}catch{/* Deletion is intentionally best effort. */}
   await this.http.post(this.endpoint(),{id:job.id,action:'delete',delivered:true},{headers:{Authorization:'Bearer '+this.secret},timeout:10000});return true;
  }

  try{
   const channel=await this.client.channels.fetch(job.channel_id);
   if(!channel||channel.guildId!==job.guildId||![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(channel.type))throw Error('The selected channel must be a text or announcement channel in this department server.');
   const me=channel.guild.members.me||await channel.guild.members.fetchMe();
   if(!channel.permissionsFor(me)?.has([PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.EmbedLinks,PermissionsBitField.Flags.AttachFiles]))throw Error('SCPF Automation needs View Channel, Send Messages, Embed Links and Attach Files in the selected channel.');
   const message=await channel.send(this.buildMessage(job));
   await this.http.post(this.endpoint(),{id:job.id,delivered:true,messageId:message.id,departmentId:job.department_id,channelId:job.channel_id},{headers:{Authorization:`Bearer ${this.secret}`},timeout:10000});return true;
  }catch(error){console.warn('[Logs] Delivery failed:',job.id,error.message);try{await this.acknowledge(job,false,error.message)}catch{}return false;}
 }
 async poll(){if(!this.isConfigured()||this.running||this.syncing)return;this.syncing=true;try{await this.syncChannels()}catch(error){console.warn('[Logs] Channel sync failed:',error.message)}finally{this.syncing=false}return super.poll();}
}
module.exports=LogDispatchService;
