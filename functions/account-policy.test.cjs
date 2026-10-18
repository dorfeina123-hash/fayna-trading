const test=require('node:test'),assert=require('node:assert/strict'),policy=require('./account-policy.js');
const a={id:'a',active:true},b={id:'b',active:true},old={pnl:8},trade={acct:'a',pnl:10};
test('single destination resolves automatically only when unambiguous',()=>{
 assert.equal(policy.target([a],null,['__all__']),'a');
 assert.equal(policy.target([a,b],null,['b']),'b');
 assert.throws(()=>policy.target([a,b],null,['__all__']),/choose_trade_account/);
 assert.throws(()=>policy.target([],null,[]),/create_trade_account/);
 assert.throws(()=>policy.target([a,{...b,active:false}],'b',[]),/invalid_trade_account/);
});
test('new trades always need an owned active account',()=>{
 const prev={td_accounts:[a],td_tradesList:[]};
 assert.throws(()=>policy.validateWorkspace(prev,{td_accounts:[a],td_tradesList:[old]},1),/trade_account_required/);
 assert.throws(()=>policy.validateWorkspace(prev,{td_accounts:[a],td_tradesList:[{acct:'foreign'}]},1),/trade_account_required/);
 assert.doesNotThrow(()=>policy.validateWorkspace(prev,{td_accounts:[a],td_tradesList:[trade]},1));
});
test('one active account limit covers account creation, reactivation and archive transitions',()=>{
 const prev={td_accounts:[a],td_tradesList:[trade]};
 assert.throws(()=>policy.validateWorkspace(prev,{td_accounts:[a,b],td_tradesList:[trade]},1),/account_limit/);
 assert.doesNotThrow(()=>policy.validateWorkspace(prev,{td_accounts:[a,{...b,active:false}],td_tradesList:[trade]},1));
 assert.doesNotThrow(()=>policy.validateWorkspace(prev,{td_accounts:[a,b],td_tradesList:[trade,{acct:'b'}]},null));
 assert.throws(()=>policy.validateWorkspace(prev,{td_accounts:[{...a,active:false}],td_tradesList:[{...trade,pnl:20}]},1),/read_only/);
 assert.throws(()=>policy.validateWorkspace(prev,{td_accounts:[],td_tradesList:[trade]},1),/account_has_trades/);
});
test('exact old unassigned records survive; copies and edits need a valid account',()=>{
 const prev={td_accounts:[a],td_tradesList:[old]},before=JSON.stringify(prev);
 assert.doesNotThrow(()=>policy.validateWorkspace(prev,structuredClone(prev),1));
 assert.throws(()=>policy.validateWorkspace(prev,{td_accounts:[a],td_tradesList:[old,old]},1),/trade_account_required/);
 assert.throws(()=>policy.validateWorkspace(prev,{td_accounts:[a],td_tradesList:[{...old,pnl:9}]},1),/trade_account_required/);
 assert.doesNotThrow(()=>policy.validateWorkspace(prev,{td_accounts:[a],td_tradesList:[{...old,acct:'a'}]},1));
 assert.equal(JSON.stringify(prev),before);
});
test('existing excess accounts remain readable but cannot accept new trades until one is selected',()=>{
 const prev={td_accounts:[a,b],td_tradesList:[trade,{acct:'b',pnl:4}]};
 assert.doesNotThrow(()=>policy.validateWorkspace(prev,structuredClone(prev),1));
 assert.throws(()=>policy.validateWorkspace(prev,{...prev,td_tradesList:[...prev.td_tradesList,{acct:'a',pnl:2}]},1),/read_only/);
 assert.doesNotThrow(()=>policy.validateWorkspace(prev,{td_accounts:[a,{...b,active:false}],td_tradesList:[...prev.td_tradesList,{acct:'a',pnl:2}]},1));
 assert.throws(()=>policy.validateWorkspace(prev,{td_accounts:[a,a],td_tradesList:[]},null),/invalid_account_id/);
});
