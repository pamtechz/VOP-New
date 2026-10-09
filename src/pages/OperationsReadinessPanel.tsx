import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, RefreshCw, ShieldCheck } from 'lucide-react';
import { auth } from '../lib/firebase';
import { getTranslation, getUiLocale } from '../services/i18n';

type ReadinessReport = {
  status:'ok'|'degraded';
  database:string;
  checkedAt:string;
  requestId?:string;
  maintenance:{status:string;lastRunAt:string|null};
  backup:{
    status:string;
    configured:boolean;
    lastCompletedAt:string|null;
    lastRunId:string|null;
    currentStatus:string|null;
    staleAfterHours:number;
  };
  deployment:{sha:string|null};
};

const t=(key:string,fallback:string)=>
  getTranslation(key,getUiLocale(),undefined,fallback,'OperationsReadinessPanel');

function readableTime(value:string|null|undefined){
  if(!value)return t('admin.operations_never','Not yet recorded');
  const date=new Date(value);
  return Number.isNaN(date.getTime())
    ?t('admin.operations_invalid_timestamp','Unavailable')
    :date.toLocaleString();
}

function labelForStatus(value:string){
  switch(value){
    case 'ok':return t('admin.operations_healthy','Healthy');
    case 'degraded':return t('admin.operations_degraded','Needs attention');
    case 'pending':return t('admin.operations_pending','Pending');
    case 'requested':return t('admin.operations_requested','Requested');
    case 'running':return t('admin.operations_running','Running');
    case 'stale':return t('admin.operations_stale','Stale');
    case 'missing':return t('admin.operations_missing','No completed backup');
    case 'not_configured':return t('admin.operations_not_configured','Not configured');
    case 'configuration_error':return t('admin.operations_configuration_error','Invalid configuration');
    case 'failed':return t('admin.operations_failed','Failed');
    default:return t('admin.operations_unknown','Unknown');
  }
}

export default function OperationsReadinessPanel(){
  const [health,setHealth]=useState<ReadinessReport|null>(null);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState('');

  const reload=useCallback(async(signal?:AbortSignal)=>{
    setBusy(true);
    setError('');
    try{
      const signedIn=auth?.currentUser;
      if(!signedIn)throw new Error(t('admin.operations_sign_in_required','Sign in to view operational readiness.'));
      const token=await signedIn.getIdToken();
      if(signal?.aborted)return;
      const response=await fetch('/api/health?detail=1',{
        method:'GET',cache:'no-store',signal,
        headers:{Authorization:'Bearer '+token,Accept:'application/json'},
      });
      const payload=await response.json().catch(()=>null) as (ReadinessReport&{error?:string})|null;
      if(!response.ok||!payload||!payload.backup||!payload.maintenance){
        throw new Error(payload?.error||t('admin.operations_unavailable','Operational readiness could not be loaded.'));
      }
      if(!signal?.aborted)setHealth(payload);
    }catch(cause){
      if(signal?.aborted)return;
      setError(cause instanceof Error?cause.message:t('admin.operations_unavailable','Operational readiness could not be loaded.'));
    }finally{
      if(!signal?.aborted)setBusy(false);
    }
  },[]);

  useEffect(()=>{
    const controller=new AbortController();
    void reload(controller.signal);
    return ()=>controller.abort();
  },[reload]);

  const backupHealthy=health?.backup.status==='ok';
  const maintenanceHealthy=health?.maintenance.status==='ok';

  return <section className="vop-operations-readiness" aria-label={t('admin.operations_title','Operational readiness')} style={{marginTop:22,paddingTop:18,borderTop:'1px solid var(--border-color, #dbe3ec)'}}>
    <div className="vop-section-title">
      <div>
        <h3>{t('admin.operations_title','Operational readiness')}</h3>
        <p>{t('admin.operations_description','Live server checks for the database, scheduled maintenance and verified Firestore backups.')}</p>
      </div>
      <button type="button" className="vop-secondary" onClick={()=>void reload()} disabled={busy}>
        <RefreshCw size={15} className={busy?'spin':''}/>
        {busy?t('admin.operations_checking','Checking…'):t('admin.operations_refresh','Refresh status')}
      </button>
    </div>

    {error&&<div role="alert" style={{marginBottom:12,display:'flex',alignItems:'center',gap:8,padding:'12px 14px',border:'1px solid #fecaca',borderRadius:10,background:'#fff1f2',color:'#9f1239'}}> 
      <AlertTriangle size={17}/>{error}
    </div>}

    {!health&&busy&&<div className="vop-setting-row" role="status">{t('admin.operations_checking','Checking…')}</div>}

    {health&&<div className="vop-setting-list">
      <div className="vop-setting-row">
        <div>
          <div className="vop-setting-name"><ShieldCheck size={16} style={{verticalAlign:'middle',marginRight:7}}/>{t('admin.operations_service_status','Platform readiness')}</div>
          <div className="vop-setting-help">{t('admin.operations_last_checked','Last checked')}: {readableTime(health.checkedAt)}</div>
        </div>
        <span className={'vop-status '+(health.status==='ok'?'enabled':'disabled')}>{labelForStatus(health.status)}</span>
      </div>
      <div className="vop-setting-row">
        <div>
          <div className="vop-setting-name"><Database size={16} style={{verticalAlign:'middle',marginRight:7}}/>{t('admin.operations_database','Firestore database')}</div>
          <div className="vop-setting-help">{t('admin.operations_database_help','Readiness is confirmed by the server, not by a browser-only connection check.')}</div>
        </div>
        <span className={'vop-status '+(health.database==='ok'?'enabled':'disabled')}>{labelForStatus(health.database)}</span>
      </div>
      <div className="vop-setting-row">
        <div>
          <div className="vop-setting-name">{t('admin.operations_maintenance','Scheduled maintenance')}</div>
          <div className="vop-setting-help">{t('admin.operations_last_run','Last run')}: {readableTime(health.maintenance.lastRunAt)}</div>
        </div>
        <span className={'vop-status '+(maintenanceHealthy?'enabled':'disabled')}>{labelForStatus(health.maintenance.status)}</span>
      </div>
      <div className="vop-setting-row">
        <div>
          <div className="vop-setting-name">{t('admin.operations_backups','Managed Firestore backups')}</div>
          <div className="vop-setting-help">{t('admin.operations_last_completed','Last verified completed export')}: {readableTime(health.backup.lastCompletedAt)}</div>
          {health.backup.currentStatus&&<div className="vop-setting-help">{t('admin.operations_export_state','Current export state')}: {labelForStatus(health.backup.currentStatus)}</div>}
        </div>
        <span className={'vop-status '+(backupHealthy?'enabled':'disabled')}>{labelForStatus(health.backup.status)}</span>
      </div>
      {!backupHealthy&&<div className="vop-setting-row" role="status">
        <div>
          <div className="vop-setting-name"><AlertTriangle size={16} style={{verticalAlign:'middle',marginRight:7}}/>{t('admin.operations_backup_action','Backup attention required')}</div>
          <div className="vop-setting-help">{health.backup.status==='not_configured'
            ?t('admin.operations_backup_configure','Configure a dedicated Google Cloud Storage export bucket and Firestore import/export IAM in production. No working backup has been verified.')
            :t('admin.operations_backup_investigate','Review the scheduled Firestore export, Cloud Storage access and the recovery runbook before treating backups as healthy.')}</div>
        </div>
      </div>}
      {backupHealthy&&<div className="vop-setting-row"><div className="vop-setting-name"><CheckCircle2 size={16} style={{verticalAlign:'middle',marginRight:7}}/>{t('admin.operations_backup_verified','A completed managed export is within the configured freshness window.')}</div></div>}
      <div className="vop-setting-row">
        <div>
          <div className="vop-setting-name">{t('admin.operations_deployment','Deployment')}</div>
          <div className="vop-setting-help">{health.deployment.sha?health.deployment.sha.slice(0,12):t('admin.operations_revision_missing','Revision unavailable')}</div>
        </div>
        <a className="vop-secondary" href="https://github.com/pamtechz/VOP-New/blob/main/docs/OPERATIONS_RUNBOOK.md" target="_blank" rel="noopener noreferrer">
          {t('admin.operations_runbook','Recovery runbook')}
        </a>
      </div>
    </div>}
  </section>;
}
