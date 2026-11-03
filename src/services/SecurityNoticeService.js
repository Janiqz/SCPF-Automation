const QuotaNotificationService=require('./QuotaNotificationService');
class SecurityNoticeService extends QuotaNotificationService{
 constructor(client,options={}){super(client,options);this.intervalMs=30000;}
 endpoint(){return this.apiUrl+'/api/internal/security-notices';}
 buildMessage(job){
  const opening={ban_account:'Your Foundation panel account has been banned.',ban_account_and_ip:'Your Foundation panel account and IP access have been blocked.',logout:'Your Foundation panel sessions have been terminated.',data_erased:'Your Foundation panel data has been wiped.',ip_data_erased:'Your stored Foundation panel IP data has been erased.'}[job.action]||'A security action was applied to your Foundation panel account.';
  return {content:opening+'\nReason: '+String(job.reason||'Administrative action').slice(0,1000)+'\nA record of this action is retained.',allowedMentions:{parse:[]},nonce:BigInt('0x'+job.id.replaceAll('-','').slice(0,16)).toString(),enforceNonce:true};
 }
 async deliver(job){
  // Security notices deliberately bypass notification preferences.
  try{const person=await this.client.users.fetch(job.discord_id);await person.send(this.buildMessage(job));await this.acknowledge(job,true);return true;}
  catch(error){const code=Number(error.code||error.status)||0;console.warn('[Security notices] Delivery failed:',job.id,code);try{await this.acknowledge(job,false,'Discord delivery failed'+(code?' ('+code+')':''))}catch{}return false;}
 }
}
module.exports=SecurityNoticeService;
