const QuotaNotificationService=require('./QuotaNotificationService');
class LeaveNotificationService extends QuotaNotificationService {
 constructor(client,options={}){super(client,options);this.intervalMs=30000;}
 endpoint(){return this.apiUrl+'/api/internal/leave/notifications';}
 buildMessage(job){
  const safe=value=>String(value||'').replace(/[\\*_~`>|]/g,'').slice(0,1600);
  const label={submitted:'submitted for review',approved:'approved',declined:'declined',ended:'ended early',cancelled:'cancelled',deleted:'deleted',revoked:'revoked (approval withdrawn)'}[job.outcome]||job.outcome;
  return {content:'Your Leave of Absence request for **'+safe(job.departmentName)+'** was **'+safe(label)+'**.\nDates: '+safe(job.startDate)+' to '+safe(job.endDate)+' (inclusive UTC).\nReason: '+safe(job.reason)+'\nView your requests: '+this.apiUrl+'/leave',allowedMentions:{parse:[]}};
 }
 async deliver(job){
  if(this.notificationPreferences&&!await this.notificationPreferences.canSend(job.discord_id)){
   await this.http.post(this.endpoint(),{id:job.id,delivered:false,skipped:true},{headers:{Authorization:'Bearer '+this.secret},timeout:10000});return true;
  }
  // The base delivery handles Discord errors and retry acknowledgements.
  const preferences=this.notificationPreferences;this.notificationPreferences=null;
  try{return await super.deliver(job)}finally{this.notificationPreferences=preferences}
 }
}
module.exports=LeaveNotificationService;
