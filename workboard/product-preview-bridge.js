// Runs the real UI snapshot with in-memory synthetic receipts only.
// No learning API, model, file contents, credentials or production writes leave this frame.
window.__WORKBOARD_PREVIEW__=true;
(()=>{
  const fixture=window.__STUDYMETA_PILOT_PREVIEW__,origin=location.origin;
  const emit=(type,detail)=>parent.postMessage({type:'workboard-preview',event:type,...detail},origin);
  let screen=fixture?.screen||'m01',session=null,input=null;
  const sessionContext=()=>({session,plan:session?.plan_id?fixture.selected_plan:null,record_count:session?3:0,pending_event_ids:[]});
  if(['learning_active','stop_confirm','review_summary','review_evidence'].includes(screen)){
    session={session_id:'22222222-2222-4222-8222-222222222222',status:'active',plan_id:fixture.selected_plan.plan_id,focus_node_ids:[],session_goal:'미리보기 학습',started_at:new Date().toISOString()};
    fixture.active_session=session;fixture.session_context=sessionContext();
  }
  window.__atlasScreen=value=>{screen=value;emit('screen',{screen});};
  window.openai={widgetState:null,setWidgetState(){},async sendFollowUpMessage(){emit('chat',{screen,message:'채팅으로 학습·분석 요청 전달 · 미리보기에서는 AI를 호출하지 않습니다.'});},async callTool(name,args={}){
    emit('tool',{name,screen,phase:'request'});await new Promise(r=>setTimeout(r,160));
    let result;
    if(name==='start_study_session'){session={session_id:crypto.randomUUID(),plan_id:args.plan_id||null,focus_node_ids:args.focus_node_ids||[],session_goal:args.session_goal,status:'active'};result=session;}
    else if(name==='get_study_session_context')result=sessionContext();
    else if(name==='update_study_session_goal'){if(!session)throw Error('미리보기 세션을 먼저 시작해주세요.');session={...session,session_goal:args.session_goal};result=session;}
    else if(name==='stop_or_change_study'){session={...session,status:'completed'};result={...fixture,screen:'stop_confirm',active_session:null,session_context:sessionContext()};}
    else if(name==='prepare_study_input'){input={request_id:args.request_id,kind:args.kind,status:'ready',material_status:args.file?'readable':'none'};result=input;}
    else if(name==='get_study_input_context')result={input};
    else if(name==='cancel_study_input'){result={...input,status:'cancelled'};input=null;}
    else if(name==='retry_study_event_processing')result={saved:true,message:'미리보기 처리 완료'};
    else if(name==='submit_pilot_feedback')result={saved:true};
    else throw Error('이 도구의 응답은 미리보기에 아직 연결되지 않았어요: '+name);
    emit('tool',{name,screen,phase:'response'});return {structuredContent:result};
  }};
  addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;const selector=[...button.attributes].find(a=>a.name.startsWith('data-'))?.name;emit('button',{screen,selector:selector?'['+selector+']':'',targetScreen:button.dataset.screen||'',label:button.textContent.trim()});},true);
})();
