'use strict';
const policy=require('./account-policy.js');
const KEYS=new Set(['td_records','td_tradesList','td_customExpenses','td_pnlOn','td_commSettings','td_customSymbols','td_recurringTemplates','td_accounts','td_bizEvents','td_bizNotes','td_notifications','td_dailyChecklist','td_checklistItemsConfig','td_habits','td_habitLog','td_lrNotes','td_personalGoals','td_tradingRules','td_coachDailyLossLimit']);
function workspacePayload(value){
 if(!value || typeof value!=='object'||Array.isArray(value))throw new Error('invalid_workspace');
 if(Object.keys(value).some(k=>!KEYS.has(k)))throw new Error('invalid_workspace_field');
 if(policy.canonical(value).length>750000)throw new Error('workspace_too_large');
 return value;
}
module.exports={workspacePayload};
