const axios=require('axios');
const {PermissionsBitField}=require('discord.js');
const roleName=name=>String(name).normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
class LeaveRoleService{
 constructor(client,options={}){this.client=client;this.http=options.httpClient||axios;this.apiUrl=String(options.apiUrl||process.env.QUOTA_API_URL||'').replace(/\/+$/,'');this.secret=options.secret||process.env.QUOTA_BOT_SECRET||'';this.timer=null;this.running=false;}
 endpoint(){return this.apiUrl+'/api/internal/leave/roles';}
 async reconcile(item){
  let success=false,error;
  try{
   let guildId=item.guildId;
   if(item.departmentId==='o5'){
    guildId=process.env.O5_GUILD_ID;
    if(!guildId){const matches=[...this.client.guilds.cache.values()].filter(g=>/\bo[- ]?5\b|overseer.*council/i.test(g.name));if(matches.length!==1)throw Error('The O5 server could not be identified uniquely by name. Set O5_GUILD_ID on the bot host.');guildId=matches[0].id;}
   }
   const guild=await this.client.guilds.fetch(guildId),roles=await guild.roles.fetch();
   const matching=[...roles.values()].filter(r=>roleName(r.name)==='leave of absence');
   if(matching.length!==1)throw Error(matching.length?'More than one role is named Leave of Absence. Keep one matching role.':'Create a role named Leave of Absence in this department server.');
   const role=matching[0],me=guild.members.me||await guild.members.fetchMe();
   if(role.managed||!me.permissions.has(PermissionsBitField.Flags.ManageRoles)||me.roles.highest.comparePositionTo(role)<=0)throw Error('Give SCPF Automation Manage Roles and position its highest role above Leave of Absence.');
   let member;try{member=await guild.members.fetch({user:item.discordId,force:true})}catch(e){if(e.code!==10007)throw e;}
   if(member){if(item.active&&!member.roles.cache.has(role.id))await member.roles.add(role,'Approved departmental Leave of Absence');if(!item.active&&member.roles.cache.has(role.id))await member.roles.remove(role,'Departmental Leave of Absence ended or cancelled');}
   else if(item.active)throw Error('The requester is not currently a member of the department server.');
   success=true;
  }catch(e){error=String(e.message||'Role reconciliation failed').slice(0,500);console.warn('[Leave roles]',item.departmentId,error);}
  await this.http.post(this.endpoint(),{departmentId:item.departmentId,discordId:item.discordId,applied:item.active,success,error},{headers:{Authorization:`Bearer ${this.secret}`},timeout:15000});
 }
 async poll(){if(this.running)return;this.running=true;try{const {data}=await this.http.get(this.endpoint(),{headers:{Authorization:`Bearer ${this.secret}`},timeout:15000});for(const item of data.assignments||[]){try{await this.reconcile(item)}catch(e){console.warn('[Leave roles] Tracking failed:',e.message);}}}catch(e){console.warn('[Leave roles] Poll failed:',e.message)}finally{this.running=false;}}
 start(){if(this.timer||!/^https?:\/\//.test(this.apiUrl)||this.secret.length<16)return;this.poll();this.timer=setInterval(()=>this.poll(),60000);this.timer.unref?.();}
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}
}
module.exports=LeaveRoleService;
