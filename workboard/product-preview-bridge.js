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
  const inspect=new URLSearchParams(location.search).get('inspect')==='1';
  let inspected=[],picked='',scheduled=false;
  function report(){
    scheduled=false;if(!inspect||!document.body)return;
    const anchors=[];
    for(const item of inspected){let button;try{button=document.querySelector(item.selector);}catch{continue;}if(!button)continue;
      const r=button.getBoundingClientRect();if(!r.width||!r.height)continue;
      button.classList.add('atlas-inspect-button');button.classList.toggle('atlas-selected',item.id===picked);
      anchors.push({id:item.id,x:r.x,y:r.y,width:r.width,height:r.height});
    }
    emit('anchors',{screen,anchors,height:Math.ceil(document.body.getBoundingClientRect().height+24)});
  }
  function reportSoon(){if(!scheduled){scheduled=true;requestAnimationFrame(report);}}
  addEventListener('message',e=>{if(e.source!==parent||e.origin!==origin||e.data?.type!=='workboard-inspect'||!inspect)return;inspected=Array.isArray(e.data.buttons)?e.data.buttons.slice(0,100):[];picked=e.data.selected;reportSoon();});
  addEventListener('DOMContentLoaded',()=>{if(!inspect)return;
    const css=document.createElement('style');css.textContent='html,body{min-height:0!important;height:auto!important;overflow:hidden!important}.atlas-inspect-button{outline:2px solid #2563eb!important;outline-offset:3px!important;cursor:crosshair!important}.atlas-selected{outline:3px solid #7c3aed!important}';document.head.append(css);
    new ResizeObserver(reportSoon).observe(document.body);new MutationObserver(reportSoon).observe(document.body,{childList:true,subtree:true});reportSoon();
  });
  addEventListener('resize',reportSoon);
  addEventListener('submit',event=>{if(inspect){event.preventDefault();event.stopImmediatePropagation();}},true);
  addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;const selector=[...button.attributes].find(a=>a.name.startsWith('data-'))?.name;
    if(inspect){event.preventDefault();event.stopImmediatePropagation();}
    emit('button',{screen,selector:selector?'['+selector+']':'',targetScreen:button.dataset.screen||'',label:button.textContent.trim()});
  },true);
})();
