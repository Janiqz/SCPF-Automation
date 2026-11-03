const QuotaNotificationService=require('./QuotaNotificationService');
class LeaveNotificationService extends QuotaNotificationService {
 endpoint(){return this.apiUrl+'/api/internal/leave/notifications';}
 buildMessage(job){
  const safe=value=>String(value||'').replace(/[\\*_~`>|]/g,'').slice(0,1600);
  return {content:'Your Leave of Absence request for **'+safe(job.departmentName)+'** was **'+safe(job.outcome)+'**.\nDates: '+safe(job.startDate)+' to '+safe(job.endDate)+' (inclusive UTC).\nReason: '+safe(job.reason)+'\nView your request: '+this.apiUrl+'/leave',allowedMentions:{parse:[]}};
 }
}
module.exports=LeaveNotificationService;
