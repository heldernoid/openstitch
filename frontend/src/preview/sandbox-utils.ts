const VENDOR = '/vendor'

/** Strip leading/trailing markdown code fences, e.g. ```html ... ```
 *  Also strips <think>...</think> reasoning blocks emitted by Qwen3 and similar models. */
export function stripFences(code: string): string {
  return code
    .replace(/<think>[\s\S]*?<\/think>/gi, '')  // reasoning model think blocks
    .replace(/^```[a-zA-Z]*\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .trim()
}

/** Play Mode navigation shim - injected into every srcdoc.
 *  Intercepts clicks on <a>, <button>, [role=button] and emits postMessage.
 *  In-page anchor links (<a href="#section">) are NOT intercepted so smooth
 *  scrolling within the page continues to work normally. */
const NAV_SHIM = `<script>
(function(){
  document.addEventListener('click',function(e){
    var orig=e.target;
    var el=orig;
    while(el&&el!==document.documentElement){
      var tag=el.tagName&&el.tagName.toUpperCase();
      var role=el.getAttribute&&el.getAttribute('role');
      if(tag==='A'||tag==='BUTTON'||role==='button'||role==='link'){
        var href=el.getAttribute&&el.getAttribute('href');
        if(tag==='A'&&href&&href.charAt(0)==='#'){
          var targetId=href.slice(1);
          if(targetId){
            var target=document.getElementById(targetId);
            if(target){
              // Real in-page anchor with a matching element — scroll only, no navigate event
              e.preventDefault();
              target.scrollIntoView({behavior:'smooth'});
              return;
            }
          }
          // href="#" or href="#nonexistent" — treat as navigation trigger (fall through)
        }
        e.preventDefault();
        var elId=el.id||'';
        var elText=(el.textContent||'').trim().slice(0,80);
        var elClass=el.className&&typeof el.className==='string'?el.className.trim():'';
        // Build path: every element from original click target up to the matched button/anchor
        var path=[];
        var cur=orig;
        while(cur){
          var curClass=cur.className&&typeof cur.className==='string'?cur.className.trim():'';
          var curTag=(cur.tagName||'').toLowerCase();
          var curText=(cur.textContent||'').trim().slice(0,120);
          // sibling indices
          var parent=cur.parentElement;
          var childIdx=0,childCount=0,typeIdx=0,typeCount=0;
          if(parent){
            var siblings=parent.children;
            for(var si=0;si<siblings.length;si++){
              if(siblings[si]===cur)childIdx=childCount;
              childCount++;
            }
            for(var si=0;si<siblings.length;si++){
              if(siblings[si].tagName===cur.tagName){
                if(siblings[si]===cur)typeIdx=typeCount;
                typeCount++;
              }
            }
          }
          // collect attributes
          var attrs={};
          if(cur.attributes){
            for(var ai=0;ai<cur.attributes.length;ai++){
              var a=cur.attributes[ai];
              if(a.name!=='class'&&a.name!=='id')attrs[a.name]=a.value;
            }
          }
          path.push({tagName:curTag,htmlId:cur.id||'',className:curClass,textContent:curText,childIndex:childIdx,childCount:childCount,typeIndex:typeIdx,typeCount:typeCount,attrs:attrs});
          if(cur===el) break;
          cur=cur.parentElement;
        }
        window.parent.postMessage({type:'navigate',selector:elId||elText,htmlId:elId,text:elText,className:elClass,tagName:(el.tagName||'').toLowerCase(),path:path},'*');
        return;
      }
      el=el.parentElement;
    }
  },true);
})();
<\/script>`

/**
 * Shadcn/ui + lucide-react compatibility shim.
 * Injected into the React sandbox so that import-stripped code that references
 * Button, Card, Badge, Dialog, lucide icons etc. resolves to working stubs.
 *
 * Rules: no backticks in this string (it's embedded in a TS template literal).
 * JSX is fine - Babel compiles it.
 */
const SHADCN_COMPAT = `
// ─── cn ──────────────────────────────────────────────────────────────────────
function cn() { var cls = Array.prototype.slice.call(arguments); return cls.filter(Boolean).join(' ') }

// ─── Button ──────────────────────────────────────────────────────────────────
var Button = React.forwardRef(function Button(props, ref) {
  var className = props.className, variant = props.variant === undefined ? 'default' : props.variant,
      size = props.size === undefined ? 'default' : props.size, children = props.children,
      rest = Object.assign({}, props); delete rest.className; delete rest.variant; delete rest.size; delete rest.asChild;
  var v = { default:'bg-slate-900 text-white hover:bg-slate-800 shadow', destructive:'bg-red-600 text-white hover:bg-red-500', outline:'border border-slate-200 bg-white hover:bg-slate-50 text-slate-900', secondary:'bg-slate-100 text-slate-900 hover:bg-slate-200', ghost:'hover:bg-slate-100 text-slate-900', link:'text-slate-900 underline-offset-4 hover:underline' };
  var s = { default:'h-9 px-4 py-2', sm:'h-8 px-3 text-xs', lg:'h-10 px-8', icon:'h-9 w-9' };
  return <button ref={ref} className={cn('inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50', v[variant]||v.default, s[size]||s.default, className)} {...rest}>{children}</button>;
});

// ─── Card ────────────────────────────────────────────────────────────────────
var Card = React.forwardRef(function Card(p, ref) { return <div ref={ref} className={cn('rounded-xl border border-slate-200 bg-white text-slate-950 shadow', p.className)} {...Object.assign({}, p, {className:undefined})} />; });
var CardHeader = React.forwardRef(function CardHeader(p, ref) { return <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', p.className)} {...Object.assign({}, p, {className:undefined})} />; });
var CardTitle = React.forwardRef(function CardTitle(p, ref) { return <h3 ref={ref} className={cn('font-semibold leading-none tracking-tight text-lg', p.className)} {...Object.assign({}, p, {className:undefined})} />; });
var CardDescription = React.forwardRef(function CardDescription(p, ref) { return <p ref={ref} className={cn('text-sm text-slate-500', p.className)} {...Object.assign({}, p, {className:undefined})} />; });
var CardContent = React.forwardRef(function CardContent(p, ref) { return <div ref={ref} className={cn('p-6 pt-0', p.className)} {...Object.assign({}, p, {className:undefined})} />; });
var CardFooter = React.forwardRef(function CardFooter(p, ref) { return <div ref={ref} className={cn('flex items-center p-6 pt-0', p.className)} {...Object.assign({}, p, {className:undefined})} />; });

// ─── Badge ───────────────────────────────────────────────────────────────────
var Badge = React.forwardRef(function Badge(props, ref) {
  var variant = props.variant || 'default';
  var v = { default:'bg-slate-900 text-white', secondary:'bg-slate-100 text-slate-900', destructive:'bg-red-600 text-white', outline:'border border-slate-200 text-slate-900' };
  var rest = Object.assign({}, props); delete rest.variant;
  return <div ref={ref} className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors', v[variant]||v.default, props.className)} {...rest} />;
});

// ─── Input / Label / Textarea ─────────────────────────────────────────────────
var Input = React.forwardRef(function Input(p, ref) { var r=Object.assign({},p,{className:undefined}); return <input ref={ref} className={cn('flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50', p.className)} {...r} />; });
var Label = React.forwardRef(function Label(p, ref) { var r=Object.assign({},p,{className:undefined}); return <label ref={ref} className={cn('text-sm font-medium leading-none', p.className)} {...r} />; });
var Textarea = React.forwardRef(function Textarea(p, ref) { var r=Object.assign({},p,{className:undefined}); return <textarea ref={ref} className={cn('flex min-h-[60px] w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50', p.className)} {...r} />; });

// ─── Avatar ──────────────────────────────────────────────────────────────────
var Avatar = React.forwardRef(function Avatar(p, ref) { var r=Object.assign({},p,{className:undefined}); return <span ref={ref} className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', p.className)} {...r} />; });
var AvatarImage = React.forwardRef(function AvatarImage(props, ref) {
  var _s = useState(false); var err = _s[0]; var setErr = _s[1];
  if (err || !props.src) return null;
  var r=Object.assign({},props,{className:undefined,onError:undefined});
  return <img ref={ref} src={props.src} alt={props.alt||''} className={cn('aspect-square h-full w-full object-cover', props.className)} onError={function(){setErr(true)}} {...r} />;
});
var AvatarFallback = React.forwardRef(function AvatarFallback(p, ref) { var r=Object.assign({},p,{className:undefined}); return <span ref={ref} className={cn('flex h-full w-full items-center justify-center rounded-full bg-slate-100 text-sm font-medium', p.className)} {...r} />; });

// ─── Separator ───────────────────────────────────────────────────────────────
var Separator = React.forwardRef(function Separator(props, ref) {
  var o = props.orientation || 'horizontal'; var r=Object.assign({},props,{className:undefined,orientation:undefined});
  return <div ref={ref} className={cn('shrink-0 bg-slate-200', o==='horizontal'?'h-px w-full':'h-full w-px', props.className)} {...r} />;
});

// ─── Table ───────────────────────────────────────────────────────────────────
var Table = React.forwardRef(function Table(p, ref) { var r=Object.assign({},p,{className:undefined}); return <div className="relative w-full overflow-auto"><table ref={ref} className={cn('w-full caption-bottom text-sm', p.className)} {...r} /></div>; });
var TableHeader = React.forwardRef(function TableHeader(p, ref) { var r=Object.assign({},p,{className:undefined}); return <thead ref={ref} className={cn('[&_tr]:border-b', p.className)} {...r} />; });
var TableBody = React.forwardRef(function TableBody(p, ref) { var r=Object.assign({},p,{className:undefined}); return <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', p.className)} {...r} />; });
var TableFooter = React.forwardRef(function TableFooter(p, ref) { var r=Object.assign({},p,{className:undefined}); return <tfoot ref={ref} className={cn('border-t bg-slate-50 font-medium', p.className)} {...r} />; });
var TableRow = React.forwardRef(function TableRow(p, ref) { var r=Object.assign({},p,{className:undefined}); return <tr ref={ref} className={cn('border-b transition-colors hover:bg-slate-50/50', p.className)} {...r} />; });
var TableHead = React.forwardRef(function TableHead(p, ref) { var r=Object.assign({},p,{className:undefined}); return <th ref={ref} className={cn('h-10 px-2 text-left align-middle font-medium text-slate-500', p.className)} {...r} />; });
var TableCell = React.forwardRef(function TableCell(p, ref) { var r=Object.assign({},p,{className:undefined}); return <td ref={ref} className={cn('p-2 align-middle', p.className)} {...r} />; });
var TableCaption = React.forwardRef(function TableCaption(p, ref) { var r=Object.assign({},p,{className:undefined}); return <caption ref={ref} className={cn('mt-4 text-sm text-slate-500', p.className)} {...r} />; });

// ─── Tabs ────────────────────────────────────────────────────────────────────
var _TabsCtx = React.createContext(null);
function Tabs(props) {
  var _s = useState(props.value !== undefined ? props.value : (props.defaultValue || ''));
  var v = _s[0]; var setV = _s[1];
  var cur = props.value !== undefined ? props.value : v;
  function onChange(nv) { setV(nv); if (props.onValueChange) props.onValueChange(nv); }
  var r=Object.assign({},props,{className:undefined,defaultValue:undefined,value:undefined,onValueChange:undefined});
  return <_TabsCtx.Provider value={{v:cur,onChange}}><div className={cn('', props.className)} {...r}>{props.children}</div></_TabsCtx.Provider>;
}
var TabsList = React.forwardRef(function TabsList(p, ref) { var r=Object.assign({},p,{className:undefined}); return <div ref={ref} role="tablist" className={cn('inline-flex h-9 items-center justify-center rounded-lg bg-slate-100 p-1 text-slate-500', p.className)} {...r} />; });
var TabsTrigger = React.forwardRef(function TabsTrigger(props, ref) {
  var ctx = React.useContext(_TabsCtx); var active = ctx && ctx.v === props.value;
  var r=Object.assign({},props,{className:undefined,value:undefined});
  return <button ref={ref} role="tab" aria-selected={active} className={cn('inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50', active?'bg-white text-slate-950 shadow':'hover:bg-slate-200 hover:text-slate-900', props.className)} onClick={function(){if(ctx)ctx.onChange(props.value)}} {...r} />;
});
var TabsContent = React.forwardRef(function TabsContent(props, ref) {
  var ctx = React.useContext(_TabsCtx);
  if (ctx && ctx.v !== props.value) return null;
  var r=Object.assign({},props,{className:undefined,value:undefined});
  return <div ref={ref} role="tabpanel" className={cn('mt-2', props.className)} {...r} />;
});

// ─── Select ──────────────────────────────────────────────────────────────────
var _SelCtx = React.createContext(null);
function Select(props) {
  var _s = useState(props.value !== undefined ? props.value : (props.defaultValue || ''));
  var v = _s[0]; var setV = _s[1];
  var _o = useState(false); var open = _o[0]; var setOpen = _o[1];
  var cur = props.value !== undefined ? props.value : v;
  function onChange(nv) { setV(nv); setOpen(false); if (props.onValueChange) props.onValueChange(nv); }
  return <_SelCtx.Provider value={{v:cur,onChange,open,setOpen}}><div style={{position:'relative',display:'inline-block',width:'100%'}}>{props.children}</div></_SelCtx.Provider>;
}
var SelectTrigger = React.forwardRef(function SelectTrigger(props, ref) {
  var ctx = React.useContext(_SelCtx); var r=Object.assign({},props,{className:undefined});
  return <button ref={ref} type="button" className={cn('flex h-9 w-full items-center justify-between rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-50', props.className)} onClick={function(){if(ctx)ctx.setOpen(function(o){return !o})}} {...r}>{props.children}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg></button>;
});
function SelectValue(props) { var ctx = React.useContext(_SelCtx); return <span>{(ctx && ctx.v) || props.placeholder || ''}</span>; }
function SelectContent(props) {
  var ctx = React.useContext(_SelCtx);
  if (!ctx || !ctx.open) return null;
  return <React.Fragment><div style={{position:'fixed',inset:0,zIndex:40}} onClick={function(){ctx.setOpen(false)}} /><div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:50,marginTop:4,borderRadius:6,border:'1px solid #e2e8f0',background:'white',boxShadow:'0 4px 6px -1px rgba(0,0,0,.1)',padding:4}}>{props.children}</div></React.Fragment>;
}
var SelectItem = React.forwardRef(function SelectItem(props, ref) {
  var ctx = React.useContext(_SelCtx); var active = ctx && ctx.v === props.value;
  var r=Object.assign({},props,{className:undefined,value:undefined});
  return <div ref={ref} className={cn('relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-slate-100', active?'font-medium':'', props.className)} onClick={function(){if(ctx)ctx.onChange(props.value)}} {...r}>{active && <svg className="mr-2 h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}{props.children}</div>;
});
function SelectGroup(p) { return <div>{p.children}</div>; }
var SelectLabel = React.forwardRef(function SelectLabel(p, ref) { var r=Object.assign({},p,{className:undefined}); return <div ref={ref} className={cn('px-2 py-1.5 text-xs font-semibold text-slate-500', p.className)} {...r} />; });
var SelectSeparator = React.forwardRef(function SelectSeparator(p, ref) { var r=Object.assign({},p,{className:undefined}); return <div ref={ref} className={cn('-mx-1 my-1 h-px bg-slate-100', p.className)} {...r} />; });

// ─── Switch ──────────────────────────────────────────────────────────────────
var Switch = React.forwardRef(function Switch(props, ref) {
  var _s = useState(props.checked !== undefined ? props.checked : (props.defaultChecked || false));
  var on = _s[0]; var setOn = _s[1];
  var cur = props.checked !== undefined ? props.checked : on;
  var r=Object.assign({},props,{className:undefined,checked:undefined,defaultChecked:undefined,onCheckedChange:undefined});
  return <button ref={ref} type="button" role="switch" aria-checked={cur} className={cn('peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50', cur?'bg-slate-900':'bg-slate-200', props.className)} onClick={function(){var n=!cur;setOn(n);if(props.onCheckedChange)props.onCheckedChange(n)}} {...r}><span className={cn('pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform', cur?'translate-x-4':'translate-x-0')} /></button>;
});

// ─── Checkbox ────────────────────────────────────────────────────────────────
var Checkbox = React.forwardRef(function Checkbox(props, ref) {
  var _s = useState(props.checked !== undefined ? props.checked : (props.defaultChecked || false));
  var on = _s[0]; var setOn = _s[1];
  var cur = props.checked !== undefined ? props.checked : on;
  var r=Object.assign({},props,{className:undefined,checked:undefined,defaultChecked:undefined,onCheckedChange:undefined});
  return <button ref={ref} type="button" role="checkbox" aria-checked={cur} className={cn('peer h-4 w-4 shrink-0 rounded-sm border border-slate-900 shadow focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center', cur?'bg-slate-900 text-white':'bg-white', props.className)} onClick={function(){var n=!cur;setOn(n);if(props.onCheckedChange)props.onCheckedChange(n)}} {...r}>{cur&&<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3"><polyline points="20 6 9 17 4 12"/></svg>}</button>;
});

// ─── Progress / Slider / ScrollArea ──────────────────────────────────────────
var Progress = React.forwardRef(function Progress(props, ref) {
  var v=props.value||0; var r=Object.assign({},props,{className:undefined,value:undefined});
  return <div ref={ref} className={cn('relative h-2 w-full overflow-hidden rounded-full bg-slate-100', props.className)} {...r}><div className="h-full bg-slate-900 transition-all" style={{width:Math.min(100,Math.max(0,v))+'%'}} /></div>;
});
var Slider = React.forwardRef(function Slider(props, ref) {
  var min=props.min||0,max=props.max||100,step=props.step||1;
  var _s=useState(props.value?props.value[0]:(props.defaultValue?props.defaultValue[0]:min));
  var v=_s[0];var setV=_s[1];
  var r=Object.assign({},props,{className:undefined,value:undefined,defaultValue:undefined,onValueChange:undefined});
  return <input ref={ref} type="range" min={min} max={max} step={step} value={props.value?props.value[0]:v} onChange={function(e){var n=Number(e.target.value);setV(n);if(props.onValueChange)props.onValueChange([n])}} className={cn('w-full accent-slate-900 cursor-pointer', props.className)} {...r} />;
});
var ScrollArea = React.forwardRef(function ScrollArea(p, ref) { var r=Object.assign({},p,{className:undefined}); return <div ref={ref} className={cn('relative overflow-auto', p.className)} {...r}>{p.children}</div>; });
var ScrollBar = React.forwardRef(function ScrollBar(p, ref) { var r=Object.assign({},p,{className:undefined}); return <div ref={ref} className={cn('flex touch-none select-none', p.className)} {...r} />; });

// ─── Dialog ──────────────────────────────────────────────────────────────────
var _DlgCtx = React.createContext(null);
function Dialog(props) {
  var _s=useState(props.open !== undefined ? props.open : (props.defaultOpen||false));
  var open=_s[0];var setOpen=_s[1];
  var cur=props.open !== undefined ? props.open : open;
  function onChange(v){setOpen(v);if(props.onOpenChange)props.onOpenChange(v);}
  return <_DlgCtx.Provider value={{open:cur,onChange}}>{props.children}</_DlgCtx.Provider>;
}
function DialogTrigger(props) {
  var ctx=React.useContext(_DlgCtx);
  return React.cloneElement(React.Children.only(props.children),{onClick:function(){if(ctx)ctx.onChange(true)}});
}
var DialogPortal=function(p){return p.children;};
var DialogOverlay=React.forwardRef(function DialogOverlay(p,ref){var r=Object.assign({},p,{className:undefined});return <div ref={ref} className={cn('fixed inset-0 z-50 bg-black/80',p.className)} {...r}/>;});
var DialogContent = React.forwardRef(function DialogContent(props, ref) {
  var ctx=React.useContext(_DlgCtx);
  if(!ctx||!ctx.open) return null;
  var r=Object.assign({},props,{className:undefined});
  return <div style={{position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center'}}>
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)'}} onClick={function(){if(ctx)ctx.onChange(false)}} />
    <div ref={ref} className={cn('relative z-50 grid w-full max-w-lg gap-4 border border-slate-200 bg-white p-6 shadow-lg rounded-lg mx-4', props.className)} {...r}>
      {props.children}
      <button type="button" onClick={function(){if(ctx)ctx.onChange(false)}} style={{position:'absolute',top:8,right:8,padding:4,cursor:'pointer',background:'none',border:'none',color:'#666',borderRadius:4}} aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  </div>;
});
function DialogHeader(p){return <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left',p.className)} {...Object.assign({},p,{className:undefined})} />;}
function DialogFooter(p){return <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',p.className)} {...Object.assign({},p,{className:undefined})} />;}
var DialogTitle=React.forwardRef(function DialogTitle(p,ref){var r=Object.assign({},p,{className:undefined});return <h2 ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight',p.className)} {...r}/>;});
var DialogDescription=React.forwardRef(function DialogDescription(p,ref){var r=Object.assign({},p,{className:undefined});return <p ref={ref} className={cn('text-sm text-slate-500',p.className)} {...r}/>;});
var DialogClose=React.forwardRef(function DialogClose(props,ref){var ctx=React.useContext(_DlgCtx);var r=Object.assign({},props);return <button ref={ref} type="button" onClick={function(){if(ctx)ctx.onChange(false)}} {...r}/>;});

// ─── Sheet ───────────────────────────────────────────────────────────────────
var _SheetCtx=React.createContext(null);
function Sheet(props){var _s=useState(props.open!==undefined?props.open:(props.defaultOpen||false));var open=_s[0];var setOpen=_s[1];var cur=props.open!==undefined?props.open:open;function onChange(v){setOpen(v);if(props.onOpenChange)props.onOpenChange(v);}return <_SheetCtx.Provider value={{open:cur,onChange}}>{props.children}</_SheetCtx.Provider>;}
function SheetTrigger(props){var ctx=React.useContext(_SheetCtx);return React.cloneElement(React.Children.only(props.children),{onClick:function(){if(ctx)ctx.onChange(true)}});}
var SheetContent=React.forwardRef(function SheetContent(props,ref){
  var ctx=React.useContext(_SheetCtx);
  if(!ctx||!ctx.open) return null;
  var side=props.side||'right';
  var pos=side==='right'?{right:0,top:0,bottom:0,width:'80%',maxWidth:480}:side==='left'?{left:0,top:0,bottom:0,width:'80%',maxWidth:480}:side==='bottom'?{left:0,right:0,bottom:0,maxHeight:'80vh'}:{left:0,right:0,top:0,maxHeight:'80vh'};
  var r=Object.assign({},props,{className:undefined,side:undefined});
  return <div style={{position:'fixed',inset:0,zIndex:50}}>
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)'}} onClick={function(){if(ctx)ctx.onChange(false)}} />
    <div ref={ref} className={cn('fixed z-50 bg-white p-6 shadow-xl overflow-y-auto flex flex-col',props.className)} style={pos} {...r}>{props.children}</div>
  </div>;
});
function SheetHeader(p){return <div className={cn('flex flex-col space-y-2 mb-4',p.className)} {...Object.assign({},p,{className:undefined})} />;}
function SheetFooter(p){return <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4',p.className)} {...Object.assign({},p,{className:undefined})} />;}
var SheetTitle=React.forwardRef(function SheetTitle(p,ref){var r=Object.assign({},p,{className:undefined});return <h2 ref={ref} className={cn('text-lg font-semibold',p.className)} {...r}/>;});
var SheetDescription=React.forwardRef(function SheetDescription(p,ref){var r=Object.assign({},p,{className:undefined});return <p ref={ref} className={cn('text-sm text-slate-500',p.className)} {...r}/>;});
var SheetClose=React.forwardRef(function SheetClose(props,ref){var ctx=React.useContext(_SheetCtx);var r=Object.assign({},props);return <button ref={ref} type="button" onClick={function(){if(ctx)ctx.onChange(false)}} {...r}/>;});

// ─── DropdownMenu ─────────────────────────────────────────────────────────────
var _DDCtx=React.createContext(null);
function DropdownMenu(props){var _s=useState(false);var open=_s[0];var setOpen=_s[1];return <_DDCtx.Provider value={{open,setOpen}}><div style={{position:'relative',display:'inline-block'}}>{props.children}</div></_DDCtx.Provider>;}
function DropdownMenuTrigger(props){var ctx=React.useContext(_DDCtx);return React.cloneElement(React.Children.only(props.children),{onClick:function(e){if(e&&e.stopPropagation)e.stopPropagation();if(ctx)ctx.setOpen(function(o){return !o})}});}
var DropdownMenuContent=React.forwardRef(function DropdownMenuContent(props,ref){
  var ctx=React.useContext(_DDCtx);
  if(!ctx||!ctx.open) return null;
  var align=props.align||'start'; var sideOffset=props.sideOffset||4;
  var r=Object.assign({},props,{className:undefined,align:undefined,sideOffset:undefined});
  return <React.Fragment>
    <div style={{position:'fixed',inset:0,zIndex:40}} onClick={function(){if(ctx)ctx.setOpen(false)}} />
    <div ref={ref} className={cn('absolute z-50 min-w-[8rem] overflow-hidden rounded-md border border-slate-200 bg-white p-1 shadow-md',align==='end'?'right-0':'left-0','top-full',props.className)} style={{marginTop:sideOffset}} {...r} />
  </React.Fragment>;
});
var DropdownMenuItem=React.forwardRef(function DropdownMenuItem(props,ref){var inset=props.inset;var r=Object.assign({},props,{className:undefined,inset:undefined});return <div ref={ref} className={cn('relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-slate-100',inset&&'pl-8',props.className)} {...r}/>;});
var DropdownMenuCheckboxItem=React.forwardRef(function DropdownMenuCheckboxItem(props,ref){var r=Object.assign({},props,{className:undefined,checked:undefined});return <div ref={ref} className={cn('relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-slate-100',props.className)} {...r}><span style={{position:'absolute',left:8}}>{props.checked&&<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>}</span>{props.children}</div>;});
var DropdownMenuLabel=React.forwardRef(function DropdownMenuLabel(props,ref){var inset=props.inset;var r=Object.assign({},props,{className:undefined,inset:undefined});return <div ref={ref} className={cn('px-2 py-1.5 text-sm font-semibold',inset&&'pl-8',props.className)} {...r}/>;});
var DropdownMenuSeparator=React.forwardRef(function DropdownMenuSeparator(p,ref){var r=Object.assign({},p,{className:undefined});return <div ref={ref} className={cn('-mx-1 my-1 h-px bg-slate-100',p.className)} {...r}/>;});
var DropdownMenuShortcut=function(p){return <span className={cn('ml-auto text-xs tracking-widest opacity-60',p.className)} {...Object.assign({},p,{className:undefined})} />;};
var DropdownMenuGroup=function(p){return <div>{p.children}</div>;};
var DropdownMenuPortal=function(p){return p.children;};
var DropdownMenuSub=function(p){return <div style={{position:'relative'}}>{p.children}</div>;};
var DropdownMenuSubContent=React.forwardRef(function DropdownMenuSubContent(p,ref){var r=Object.assign({},p,{className:undefined});return <div ref={ref} className={cn('absolute left-full top-0 z-50 min-w-[8rem] overflow-hidden rounded-md border border-slate-200 bg-white p-1 shadow-md',p.className)} {...r}/>;});
var DropdownMenuSubTrigger=React.forwardRef(function DropdownMenuSubTrigger(props,ref){var inset=props.inset;var r=Object.assign({},props,{className:undefined,inset:undefined});return <div ref={ref} className={cn('flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100',inset&&'pl-8',props.className)} {...r}>{props.children}<svg className="ml-auto h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg></div>;});
var DropdownMenuRadioGroup=function(p){return <div>{p.children}</div>;};
var DropdownMenuRadioItem=React.forwardRef(function DropdownMenuRadioItem(p,ref){var r=Object.assign({},p,{className:undefined});return <div ref={ref} className={cn('relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-slate-100',p.className)} {...r}><span style={{position:'absolute',left:8}}>•</span>{p.children}</div>;});

// ─── Tooltip ─────────────────────────────────────────────────────────────────
var TooltipProvider=function(p){return p.children;};
var _TTCtx=React.createContext(null);
function Tooltip(props){var _s=useState(false);var open=_s[0];var setOpen=_s[1];return <_TTCtx.Provider value={{open,setOpen}}><div style={{position:'relative',display:'inline-block'}}>{props.children}</div></_TTCtx.Provider>;}
function TooltipTrigger(props){var ctx=React.useContext(_TTCtx);return React.cloneElement(React.Children.only(props.children),{onMouseEnter:function(){if(ctx)ctx.setOpen(true)},onMouseLeave:function(){if(ctx)ctx.setOpen(false)}});}
var TooltipContent=React.forwardRef(function TooltipContent(props,ref){var ctx=React.useContext(_TTCtx);if(!ctx||!ctx.open)return null;var sideOffset=props.sideOffset||4;var r=Object.assign({},props,{className:undefined,side:undefined,sideOffset:undefined});return <div ref={ref} className={cn('absolute z-50 bottom-full left-1/2 -translate-x-1/2 overflow-hidden rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white',props.className)} style={{marginBottom:sideOffset}} {...r}/>;});

// ─── Popover ─────────────────────────────────────────────────────────────────
var _PopCtx=React.createContext(null);
function Popover(props){var _s=useState(props.open!==undefined?props.open:false);var open=_s[0];var setOpen=_s[1];var cur=props.open!==undefined?props.open:open;function onChange(v){setOpen(v);if(props.onOpenChange)props.onOpenChange(v);}return <_PopCtx.Provider value={{open:cur,onChange}}><div style={{position:'relative',display:'inline-block'}}>{props.children}</div></_PopCtx.Provider>;}
function PopoverTrigger(props){var ctx=React.useContext(_PopCtx);return React.cloneElement(React.Children.only(props.children),{onClick:function(){if(ctx)ctx.onChange(!ctx.open)}});}
var PopoverContent=React.forwardRef(function PopoverContent(props,ref){var ctx=React.useContext(_PopCtx);if(!ctx||!ctx.open)return null;var align=props.align||'center';var sideOffset=props.sideOffset||4;var r=Object.assign({},props,{className:undefined,align:undefined,sideOffset:undefined});return <React.Fragment><div style={{position:'fixed',inset:0,zIndex:40}} onClick={function(){if(ctx)ctx.onChange(false)}} /><div ref={ref} className={cn('absolute z-50 w-72 rounded-md border border-slate-200 bg-white p-4 shadow-md top-full',align==='end'?'right-0':align==='center'?'left-1/2 -translate-x-1/2':'left-0',props.className)} style={{marginTop:sideOffset}} {...r}/></React.Fragment>;});

// ─── Command ─────────────────────────────────────────────────────────────────
var Command=React.forwardRef(function Command(p,ref){var r=Object.assign({},p,{className:undefined});return <div ref={ref} className={cn('flex h-full w-full flex-col overflow-hidden rounded-md bg-white text-slate-950',p.className)} {...r}/>;});
var CommandInput=React.forwardRef(function CommandInput(p,ref){var r=Object.assign({},p,{className:undefined});return <div className="flex items-center border-b px-3"><svg className="mr-2 h-4 w-4 shrink-0 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><input ref={ref} className={cn('flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50',p.className)} {...r}/></div>;});
var CommandList=React.forwardRef(function CommandList(p,ref){var r=Object.assign({},p,{className:undefined});return <div ref={ref} className={cn('max-h-[300px] overflow-y-auto overflow-x-hidden',p.className)} {...r}/>;});
var CommandEmpty=React.forwardRef(function CommandEmpty(p,ref){return <div ref={ref} className="py-6 text-center text-sm" {...p}/>;});
var CommandGroup=React.forwardRef(function CommandGroup(p,ref){var r=Object.assign({},p,{className:undefined});return <div ref={ref} className={cn('overflow-hidden p-1 text-slate-950',p.className)} {...r}/>;});
var CommandItem=React.forwardRef(function CommandItem(p,ref){var r=Object.assign({},p,{className:undefined});return <div ref={ref} className={cn('relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-slate-100',p.className)} {...r}/>;});
var CommandSeparator=React.forwardRef(function CommandSeparator(p,ref){var r=Object.assign({},p,{className:undefined});return <div ref={ref} className={cn('-mx-1 h-px bg-slate-200',p.className)} {...r}/>;});
var CommandShortcut=function(p){return <span className={cn('ml-auto text-xs tracking-widest text-slate-400',p.className)} {...Object.assign({},p,{className:undefined})}/>;};

// ─── Form (react-hook-form stubs) ────────────────────────────────────────────
var Form=function(p){return <form {...p}/>;};
var FormItem=React.forwardRef(function FormItem(p,ref){var r=Object.assign({},p,{className:undefined});return <div ref={ref} className={cn('space-y-2',p.className)} {...r}/>;});
var FormLabel=React.forwardRef(function FormLabel(p,ref){var r=Object.assign({},p,{className:undefined});return <label ref={ref} className={cn('text-sm font-medium leading-none',p.className)} {...r}/>;});
var FormControl=React.forwardRef(function FormControl(props,ref){return React.Children.count(props.children)===1?React.cloneElement(React.Children.only(props.children),{ref}):props.children;});
var FormDescription=React.forwardRef(function FormDescription(p,ref){var r=Object.assign({},p,{className:undefined});return <p ref={ref} className={cn('text-sm text-slate-500',p.className)} {...r}/>;});
var FormMessage=React.forwardRef(function FormMessage(props,ref){if(!props.children)return null;var r=Object.assign({},props,{className:undefined});return <p ref={ref} className={cn('text-sm font-medium text-red-600',props.className)} {...r}/>;});
var FormField=function(props){if(props.render)return props.render({field:{name:props.name||'',value:'',onChange:function(){},onBlur:function(){},ref:function(){}}});return null;};
var useForm=function(opts){var dv=opts&&opts.defaultValues||{};var _s=useState(dv);var vals=_s[0];var setVals=_s[1];return {register:function(name){return {name:name,value:vals[name]||'',onChange:function(e){var v=e&&e.target?e.target.value:e;setVals(function(s){var n=Object.assign({},s);n[name]=v;return n;});}};},handleSubmit:function(fn){return function(e){if(e&&e.preventDefault)e.preventDefault();fn(vals);};},formState:{errors:{},isSubmitting:false},control:{},reset:function(v){setVals(v||dv);},watch:function(name){return name?vals[name]:vals;},setValue:function(name,value){setVals(function(s){var n=Object.assign({},s);n[name]=value;return n;});},getValues:function(name){return name?vals[name]:vals;},};};
var Controller=function(props){var _s=useState(props.defaultValue!==undefined?props.defaultValue:'');var v=_s[0];var setV=_s[1];if(props.render)return props.render({field:{name:props.name||'',value:v,onChange:setV,onBlur:function(){},ref:function(){}}});return null;};
var zodResolver=function(){return function(){return Promise.resolve({values:{},errors:{}});};};
var z={object:function(s){return {parse:function(d){return d;},safeParse:function(d){return {success:true,data:d};},extend:function(){return this;}};},string:function(){var c={min:function(){return c;},max:function(){return c;},email:function(){return c;},optional:function(){return c;},nonempty:function(){return c;}};return c;},number:function(){var c={min:function(){return c;},max:function(){return c;},optional:function(){return c;}};return c;},boolean:function(){var c={optional:function(){return c;}};return c;},array:function(){var c={min:function(){return c;},optional:function(){return c;}};return c;},enum:function(){return {optional:function(){return this;}};},infer:null,};

// ─── Lucide-react icons ───────────────────────────────────────────────────────
function __lucide(paths, extras) {
  return React.forwardRef(function(props, ref) {
    var size=props.size||24,cls=props.className,color=props.color||'currentColor',sw=props.strokeWidth||2;
    var rest=Object.assign({},props);delete rest.size;delete rest.className;delete rest.color;delete rest.strokeWidth;delete rest.absoluteStrokeWidth;
    return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden="true" {...rest}>{paths.map(function(d,i){return <path key={i} d={d}/>;})}{extras}</svg>;
  });
}
var Search=__lucide(['M21 21l-4.35-4.35','M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0']); var SearchIcon=Search;
var Menu=__lucide(['M4 6h16','M4 12h16','M4 18h16']); var MenuIcon=Menu;
var X=__lucide(['M18 6 6 18','M6 6l12 12']); var XIcon=X; var Close=X; var CloseIcon=X;
var ChevronDown=__lucide(['M6 9l6 6 6-6']); var ChevronDownIcon=ChevronDown;
var ChevronUp=__lucide(['M18 15l-6-6-6 6']); var ChevronUpIcon=ChevronUp;
var ChevronLeft=__lucide(['M15 18l-6-6 6-6']); var ChevronLeftIcon=ChevronLeft;
var ChevronRight=__lucide(['M9 18l6-6-6-6']); var ChevronRightIcon=ChevronRight;
var ArrowLeft=__lucide(['M19 12H5','M12 19l-7-7 7-7']); var ArrowLeftIcon=ArrowLeft;
var ArrowRight=__lucide(['M5 12h14','M12 5l7 7-7 7']); var ArrowRightIcon=ArrowRight;
var ArrowUp=__lucide(['M12 19V5','M5 12l7-7 7 7']); var ArrowUpIcon=ArrowUp;
var ArrowDown=__lucide(['M12 5v14','M19 12l-7 7-7-7']); var ArrowDownIcon=ArrowDown;
var Plus=__lucide(['M12 5v14','M5 12h14']); var PlusIcon=Plus; var PlusCircle=__lucide(['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z','M12 8v8','M8 12h8']); var PlusCircleIcon=PlusCircle;
var Minus=__lucide(['M5 12h14']); var MinusIcon=Minus;
var Check=__lucide(['M20 6 9 17l-5-5']); var CheckIcon=Check;
var Home=__lucide(['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z','M9 22V12h6v10']); var HomeIcon=Home;
var User=__lucide(['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2','M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8']); var UserIcon=User;
var Users=__lucide(['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2','M23 21v-2a4 4 0 0 0-3-3.87','M16 3.13a4 4 0 0 1 0 7.75','M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8']); var UsersIcon=Users;
var Mail=__lucide(['M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z','M22 6l-10 7L2 6']); var MailIcon=Mail;
var Phone=__lucide(['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z']); var PhoneIcon=Phone;
var Calendar=__lucide(['M8 2v4','M16 2v4','M3 10h18','M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z']); var CalendarIcon=Calendar; var CalendarDays=Calendar; var CalendarDaysIcon=Calendar;
var MapPin=__lucide(['M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z','M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4']); var MapPinIcon=MapPin;
var Bell=__lucide(['M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9','M13.73 21a2 2 0 0 1-3.46 0']); var BellIcon=Bell; var BellRing=Bell; var BellRingIcon=Bell;
var Star=__lucide(['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z']); var StarIcon=Star;
var Heart=__lucide(['M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z']); var HeartIcon=Heart;
var Trash=__lucide(['M3 6h18','M8 6V4h8v2','M19 6l-1 14H6L5 6']); var TrashIcon=Trash; var Trash2=Trash; var Trash2Icon=Trash;
var Edit=__lucide(['M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7','M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z']); var EditIcon=Edit;
var Pencil=__lucide(['M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z']); var PencilIcon=Pencil; var Edit2=Pencil; var Edit2Icon=Pencil; var Edit3=Pencil; var Edit3Icon=Pencil;
var Eye=__lucide(['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z','M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6']); var EyeIcon=Eye;
var EyeOff=__lucide(['M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24','M1 1l22 22']); var EyeOffIcon=EyeOff;
var Lock=__lucide(['M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z','M7 11V7a5 5 0 0 1 10 0v4']); var LockIcon=Lock;
var Unlock=__lucide(['M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z','M7 11V7a5 5 0 0 1 9.9-1']); var UnlockIcon=Unlock;
var Download=__lucide(['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4','M7 10l5 5 5-5','M12 15V3']); var DownloadIcon=Download;
var Upload=__lucide(['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4','M17 8l-5-5-5 5','M12 3v12']); var UploadIcon=Upload;
var Share=__lucide(['M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M8.59 13.51l6.83 3.98','M15.41 6.51L8.59 10.49']); var ShareIcon=Share; var Share2=Share; var Share2Icon=Share;
var Filter=__lucide(['M22 3H2l8 9.46V19l4 2v-8.54L22 3z']); var FilterIcon=Filter;
var Grid=__lucide(['M3 3h7v7H3z','M14 3h7v7h-7z','M14 14h7v7h-7z','M3 14h7v7H3z']); var GridIcon=Grid; var LayoutGrid=Grid; var LayoutGridIcon=Grid;
var List=__lucide(['M8 6h13','M8 12h13','M8 18h13','M3 6h.01','M3 12h.01','M3 18h.01']); var ListIcon=List;
var MoreHorizontal=__lucide([],[<circle key="a" cx="12" cy="12" r="1"/>,<circle key="b" cx="19" cy="12" r="1"/>,<circle key="c" cx="5" cy="12" r="1"/>]); var MoreHorizontalIcon=MoreHorizontal; var Ellipsis=MoreHorizontal; var EllipsisIcon=MoreHorizontal;
var MoreVertical=__lucide([],[<circle key="a" cx="12" cy="12" r="1"/>,<circle key="b" cx="12" cy="5" r="1"/>,<circle key="c" cx="12" cy="19" r="1"/>]); var MoreVerticalIcon=MoreVertical; var EllipsisVertical=MoreVertical; var EllipsisVerticalIcon=MoreVertical;
var ExternalLink=__lucide(['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6','M15 3h6v6','M10 14L21 3']); var ExternalLinkIcon=ExternalLink;
var Link=__lucide(['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71','M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71']); var LinkIcon=Link; var Link2=Link; var Link2Icon=Link;
var Copy=__lucide(['M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z','M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1']); var CopyIcon=Copy;
var Save=__lucide(['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z','M17 21v-8H7v8','M7 3v5h8']); var SaveIcon=Save;
var Image=__lucide(['M21 19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z','M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3','M21 15l-5-5L5 21']); var ImageIcon=Image;
var File=__lucide(['M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z','M13 2v7h7']); var FileIcon=File;
var FileText=__lucide(['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z','M14 2v6h6','M16 13H8','M16 17H8','M10 9H8']); var FileTextIcon=FileText;
var Folder=__lucide(['M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z']); var FolderIcon=Folder;
var RefreshCw=__lucide(['M23 4v6h-6','M1 20v-6h6','M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15']); var RefreshCwIcon=RefreshCw; var RotateCcw=RefreshCw; var RotateCcwIcon=RefreshCw; var RefreshCcw=RefreshCw; var RefreshCcwIcon=RefreshCw;
var LogOut=__lucide(['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4','M16 17l5-5-5-5','M21 12H9']); var LogOutIcon=LogOut;
var LogIn=__lucide(['M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4','M10 17l5-5-5-5','M15 12H3']); var LogInIcon=LogIn;
var CreditCard=__lucide(['M1 4h22v16H1z','M1 10h22']); var CreditCardIcon=CreditCard;
var ShoppingCart=__lucide(['M9 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2z','M20 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2z','M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6']); var ShoppingCartIcon=ShoppingCart;
var ShoppingBag=__lucide(['M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z','M3 6h18','M16 10a4 4 0 0 1-8 0']); var ShoppingBagIcon=ShoppingBag;
var Tag=__lucide(['M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z','M7 7h.01']); var TagIcon=Tag;
var Activity=__lucide(['M22 12h-4l-3 9L9 3l-3 9H2']); var ActivityIcon=Activity;
var BarChart=__lucide(['M18 20V10','M12 20V4','M6 20v-6']); var BarChartIcon=BarChart; var BarChart2=BarChart; var BarChart2Icon=BarChart; var BarChart3=BarChart; var BarChart3Icon=BarChart;
var TrendingUp=__lucide(['M23 6l-9.5 9.5-5-5L1 18','M17 6h6v6']); var TrendingUpIcon=TrendingUp;
var TrendingDown=__lucide(['M23 18l-9.5-9.5-5 5L1 6','M17 18h6v-6']); var TrendingDownIcon=TrendingDown;
var PieChart=__lucide(['M21.21 15.89A10 10 0 1 1 8 2.83','M22 12A10 10 0 0 0 12 2v10z']); var PieChartIcon=PieChart;
var MessageSquare=__lucide(['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z']); var MessageSquareIcon=MessageSquare;
var MessageCircle=__lucide(['M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z']); var MessageCircleIcon=MessageCircle;
var Send=__lucide(['M22 2L11 13','M22 2L15 22l-4-9-9-4 20-7z']); var SendIcon=Send;
var Info=__lucide(['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z','M12 16v-4','M12 8h.01']); var InfoIcon=Info;
var AlertCircle=__lucide(['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z','M12 8v4','M12 16h.01']); var AlertCircleIcon=AlertCircle; var AlertOctagon=AlertCircle; var AlertOctagonIcon=AlertCircle;
var AlertTriangle=__lucide(['M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z','M12 9v4','M12 17h.01']); var AlertTriangleIcon=AlertTriangle;
var CheckCircle=__lucide(['M22 11.08V12a10 10 0 1 1-5.93-9.14','M22 4 12 14.01l-3-3']); var CheckCircleIcon=CheckCircle; var CheckCircle2=CheckCircle; var CheckCircle2Icon=CheckCircle;
var XCircle=__lucide(['M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0z','M15 9l-6 6','M9 9l6 6']); var XCircleIcon=XCircle;
var HelpCircle=__lucide(['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z','M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3','M12 17h.01']); var HelpCircleIcon=HelpCircle; var CircleHelp=HelpCircle; var CircleHelpIcon=HelpCircle;
var Zap=__lucide(['M13 2L3 14h9l-1 8 10-12h-9l1-8z']); var ZapIcon=Zap;
var Globe=__lucide(['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z','M2 12h20','M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z']); var GlobeIcon=Globe; var Globe2=Globe; var Globe2Icon=Globe;
var Building=__lucide(['M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18z','M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2','M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2','M10 6h4','M10 10h4','M10 14h4','M10 18h4']); var BuildingIcon=Building; var Building2=Building; var Building2Icon=Building;
var Briefcase=__lucide(['M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z','M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2']); var BriefcaseIcon=Briefcase;
var Settings=__lucide(['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z']); var SettingsIcon=Settings; var Cog=Settings; var CogIcon=Settings;
var Package=__lucide(['M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z','M3.27 6.96 12 12.01l8.73-5.05','M12 22.08V12']); var PackageIcon=Package;
var Layers=__lucide(['M12 2 2 7l10 5 10-5-10-5z','M2 17l10 5 10-5','M2 12l10 5 10-5']); var LayersIcon=Layers;
var LayoutDashboard=__lucide(['M12 3H3v7h9V3z','M21 3h-7v4h7V3z','M21 11h-7v10h7V11z','M12 14H3v7h9v-7z']); var LayoutDashboardIcon=LayoutDashboard;
var Sparkles=__lucide(['M12 3 9.5 9.5 3 12l6.5 2.5L12 21l2.5-6.5L21 12l-6.5-2.5L12 3z']); var SparklesIcon=Sparkles;
var Wand2=__lucide(['M15 4 9 20','M9.5 9.5l5 5','M4.5 14.5l5-5']); var Wand2Icon=Wand2; var Wand=Wand2; var WandIcon=Wand2;
var Code=__lucide(['M16 18l6-6-6-6','M8 6l-6 6 6 6']); var CodeIcon=Code; var Code2=Code; var Code2Icon=Code;
var Terminal=__lucide(['M4 17l6-6-6-6','M12 19h8']); var TerminalIcon=Terminal;
var Database=__lucide(['M12 2a9 3 0 1 0 0 6 9 3 0 0 0 0-6z','M3 5v14a9 3 0 0 0 18 0V5','M3 12a9 3 0 0 0 18 0']); var DatabaseIcon=Database;
var Server=__lucide(['M2 9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9z','M2 15a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2z','M6 12h.01','M6 18h.01']); var ServerIcon=Server;
var Wifi=__lucide(['M5 12.55a11 11 0 0 1 14.08 0','M1.42 9a16 16 0 0 1 21.16 0','M8.53 16.11a6 6 0 0 1 6.95 0','M12 20h.01']); var WifiIcon=Wifi;
var Smartphone=__lucide(['M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 0-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z','M12 18h.01']); var SmartphoneIcon=Smartphone;
var Monitor=__lucide(['M20 3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z','M8 21h8','M12 17v4']); var MonitorIcon=Monitor;
var Clock=__lucide(['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z','M12 6v6l4 2']); var ClockIcon=Clock;
var Sun=__lucide(['M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z','M12 1v2','M12 21v2','M4.22 4.22l1.42 1.42','M18.36 18.36l1.42 1.42','M1 12h2','M21 12h2','M4.22 19.78l1.42-1.42','M18.36 5.64l1.42-1.42']); var SunIcon=Sun;
var Moon=__lucide(['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z']); var MoonIcon=Moon;
var Award=__lucide(['M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14z','M8.21 13.89 7 23l5-3 5 3-1.21-9.12']); var AwardIcon=Award;
var Target=__lucide(['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z','M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z','M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z']); var TargetIcon=Target;
var Rocket=__lucide(['M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z','M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z','M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0','M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5']); var RocketIcon=Rocket;
var Flame=__lucide(['M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z']); var FlameIcon=Flame;
var Bot=__lucide(['M12 8V4H8','M8 8h8a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4z','M10 16h.01','M14 16h.01']); var BotIcon=Bot;
var Cpu=__lucide(['M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 0-2-2V9m0 0h18']); var CpuIcon=Cpu;
var GitBranch=__lucide(['M6 3v12','M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M18 9a9 9 0 0 1-9 9']); var GitBranchIcon=GitBranch;
var Github=__lucide(['M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22']); var GithubIcon=Github;
var Twitter=__lucide(['M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z']); var TwitterIcon=Twitter;
var Linkedin=__lucide(['M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z','M2 9h4v12H2z'],[<circle key="c" cx="4" cy="4" r="2"/>]); var LinkedinIcon=Linkedin;
var Loader=__lucide(['M12 2v4','M12 18v4','M4.93 4.93l2.83 2.83','M16.24 16.24l2.83 2.83','M2 12h4','M18 12h4','M4.93 19.07l2.83-2.83','M16.24 7.76l2.83-2.83']); var LoaderIcon=Loader; var Loader2=Loader; var Loader2Icon=Loader;
var SlidersHorizontal=__lucide(['M21 4H14','M10 4H3','M21 12H12','M8 12H3','M21 20H16','M12 20H3','M14 2v4','M8 10v4','M16 18v4']); var SlidersHorizontalIcon=SlidersHorizontal;
var Users2=Users; var Users2Icon=Users;
var UserPlus=__lucide(['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2','M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8','M19 8v6','M22 11h-6']); var UserPlusIcon=UserPlus;
var UserMinus=__lucide(['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2','M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8','M22 11h-6']); var UserMinusIcon=UserMinus;
var UserCheck=__lucide(['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2','M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8','M17 11l2 2 4-4']); var UserCheckIcon=UserCheck;
var Crown=__lucide(['M12 2l3 7H22l-5.5 4 2 7L12 17l-6.5 3 2-7L2 9h7l3-7z']); var CrownIcon=Crown;
var Shield=__lucide(['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z']); var ShieldIcon=Shield;
var ShieldCheck=__lucide(['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z','M9 12l2 2 4-4']); var ShieldCheckIcon=ShieldCheck;
var Key=__lucide(['M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4']); var KeyIcon=Key;
var DollarSign=__lucide(['M12 1v22','M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6']); var DollarSignIcon=DollarSign;
var TrendingUp2=TrendingUp;
var Maximize=__lucide(['M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3']); var MaximizeIcon=Maximize; var Maximize2=Maximize; var Maximize2Icon=Maximize;
var Minimize=__lucide(['M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3']); var MinimizeIcon=Minimize; var Minimize2=Minimize; var Minimize2Icon=Minimize;
var Newspaper=__lucide(['M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2','M18 14h-8','M15 18h-5','M10 6h8v4h-8V6z']); var NewspaperIcon=Newspaper;
var BookOpen=__lucide(['M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z','M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z']); var BookOpenIcon=BookOpen; var Book=BookOpen; var BookIcon=BookOpen;
var Video=__lucide(['M15 10l4.55-2.56A1 1 0 0 1 21 8.37V15.6a1 1 0 0 1-1.45.89L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z']); var VideoIcon=Video;
var Mic=__lucide(['M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z','M19 10v2a7 7 0 0 1-14 0v-2','M12 19v4','M8 23h8']); var MicIcon=Mic;
var Volume2=__lucide(['M11 5L6 9H2v6h4l5 4V5z','M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07']); var Volume2Icon=Volume2; var VolumeX=__lucide(['M11 5L6 9H2v6h4l5 4V5z','M23 9l-6 6','M17 9l6 6']); var VolumeXIcon=VolumeX;
var Palette=__lucide(['M12 22a10 10 0 0 1 0-20c5.5 0 10 4 10 9a4.5 4.5 0 0 1-4.5 4.5h-1.8a2 2 0 0 0-1.4 3.4 2 2 0 0 1-1.4 3.4A5.5 5.5 0 0 1 8 22']); var PaletteIcon=Palette;
var Layout=__lucide(['M21 3H3v18h18V3z','M3 9h18','M9 21V9']); var LayoutIcon=Layout;
`

/** Build an srcdoc HTML string for the given framework and generated code. */
export function buildSrcdoc(framework: string, code: string): string {
  const clean = stripFences(code)
  switch (framework) {
    case 'html_tailwind':
      return buildHtmlTailwind(clean)
    case 'react_tailwind':
      return buildReactTailwind(clean)
    case 'vue_tailwind':
      return buildVueTailwind(clean)
    case 'html_css':
    default:
      return buildHtmlCss(clean)
  }
}

// ---------------------------------------------------------------------------
// html_tailwind
// ---------------------------------------------------------------------------
function buildHtmlTailwind(code: string): string {
  const isFullDoc = /^<!doctype/i.test(code.trimStart()) || /^<html/i.test(code.trimStart())
  if (isFullDoc) {
    // If the code already has any Tailwind script (CDN Play CDN or local vendor),
    // leave it as-is to preserve full fidelity (custom configs, JIT classes, etc.).
    // Only inject the local vendor when Tailwind is absent entirely.
    const hasTailwind = /<script\b[^>]*tailwind/i.test(code)
    let processed = code
    if (!hasTailwind) {
      processed = /<\/head>/i.test(code)
        ? code.replace(/<\/head>/i, `<script src="${VENDOR}/tailwind.min.js"></script>\n</head>`)
        : `<script src="${VENDOR}/tailwind.min.js"></script>\n` + code
    }
    return processed.replace(/<\/body>/i, `${NAV_SHIM}\n</body>`)
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="${VENDOR}/tailwind.min.js"></script>
</head>
<body>
${code}
${NAV_SHIM}
</body>
</html>`
}

// ---------------------------------------------------------------------------
// react_tailwind
// ---------------------------------------------------------------------------
function buildReactTailwind(code: string): string {
  // Strip ES import lines and `export default` since we inject globals instead.
  const stripped = code
    .replace(/^import\s+.*from\s+['"][^'"]+['"]\s*;?\s*\n?/gm, '')
    .replace(/^export\s+default\s+/m, '')
    .trim()

  // Detect what the top-level component is named so we can mount it regardless
  // of whether the model used App, PricingPage, Dashboard, etc.
  const fnMatch = /^(?:async\s+)?function\s+([$\w]+)/m.exec(stripped)
  const classMatch = /^class\s+([$\w]+)/m.exec(stripped)
  const constMatch = /^const\s+([$\w]+)\s*=\s*(?:\([^)]*\)\s*=>|function)/m.exec(stripped)
  const detectedName = fnMatch?.[1] ?? classMatch?.[1] ?? constMatch?.[1] ?? null
  const knownNames = new Set(['App', 'Component', 'Page', 'Screen'])

  const extraCheck = detectedName && !knownNames.has(detectedName)
    ? `\n  : typeof ${detectedName} !== 'undefined' ? ${detectedName}`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="${VENDOR}/tailwind.min.js"></script>
<script src="${VENDOR}/react.production.min.js"></script>
<script src="${VENDOR}/react-dom.production.min.js"></script>
<script src="${VENDOR}/babel.min.js"></script>
</head>
<body>
${NAV_SHIM}
<div id="root"></div>
<script type="text/babel" data-presets="react">
const { useState, useEffect, useRef, useCallback, useMemo } = React;

${SHADCN_COMPAT}

${stripped}

const __root = typeof App !== 'undefined' ? App
  : typeof Component !== 'undefined' ? Component
  : typeof Page !== 'undefined' ? Page
  : typeof Screen !== 'undefined' ? Screen${extraCheck}
  : null;

if (__root) {
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(__root));
}
</script>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// vue_tailwind
// ---------------------------------------------------------------------------

/** Extract top-level const/let/var/function names for explicit setup() return. */
function extractVueBindings(code: string): string {
  const names = new Set<string>()
  const varRe = /(?:^|\n)\s*(?:const|let|var)\s+([$\w]+)/g
  const fnRe = /(?:^|\n)\s*function\s+([$\w]+)/g
  let m
  while ((m = varRe.exec(code)) !== null) names.add(m[1])
  while ((m = fnRe.exec(code)) !== null) names.add(m[1])
  return [...names].join(', ')
}

function buildVueTailwind(code: string): string {
  // Prefer <script setup>, fall back to <script>
  const templateMatch = /<template>([\s\S]*?)<\/template>/i.exec(code)
  const scriptSetupMatch = /<script\s+setup[^>]*>([\s\S]*?)<\/script>/i.exec(code)
  const scriptMatch = scriptSetupMatch
    ? null
    : /<script[^>]*>([\s\S]*?)<\/script>/i.exec(code)
  const styleMatch = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(code)

  const template = templateMatch ? templateMatch[1].trim() : code
  const style = styleMatch ? styleMatch[1] : ''
  // Escape template for use in a JS template literal
  const escapedTemplate = template.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')

  let setupBody: string
  if (scriptSetupMatch) {
    // Strip any import statements (Vue composables are already imported from vendor)
    const raw = scriptSetupMatch[1]
      .replace(/^import\s[^\n]+\n?/gm, '')
      .trim()
    const returns = extractVueBindings(raw)
    setupBody = returns ? `${raw}\n    return { ${returns} }` : `${raw}\n    return {}`
  } else if (scriptMatch) {
    // Look for an explicit setup() inside export default { ... }
    const setupFnMatch = /setup\s*\(\s*\)\s*\{([\s\S]*?)\n\s*\}/i.exec(scriptMatch[1])
    setupBody = setupFnMatch ? setupFnMatch[1].trim() : 'return {}'
  } else {
    setupBody = 'return {}'
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="${VENDOR}/tailwind.min.js"></script>
${style ? `<style>${style}</style>` : ''}
</head>
<body>
${NAV_SHIM}
<div id="app"></div>
<script type="module">
import { createApp, ref, reactive, computed, onMounted, watch, nextTick } from '${VENDOR}/vue.esm-browser.prod.js';

const __app = createApp({
  template: \`${escapedTemplate}\`,
  setup() {
    ${setupBody}
  }
});

// Treat all PascalCase tags as pass-through custom elements so undefined
// component imports from shadcn/ui, lucide-vue-next etc. don't crash Vue.
__app.config.compilerOptions = __app.config.compilerOptions || {};
__app.config.compilerOptions.isCustomElement = function(tag) {
  return /^[A-Z]/.test(tag);
};
// Silence unknown component warnings
__app.config.warnHandler = function() {};

__app.mount('#app');
</script>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// html_css
// ---------------------------------------------------------------------------
function buildHtmlCss(code: string): string {
  const isFullDoc = /^<!doctype/i.test(code.trimStart()) || /^<html/i.test(code.trimStart())
  if (isFullDoc) {
    return code.replace(/<\/body>/i, `${NAV_SHIM}\n</body>`)
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
${code}
${NAV_SHIM}
</body>
</html>`
}

// ─── Design Mode ────────────────────────────────────────────────────────────

const DESIGN_MODE_SCRIPT = `<script>
(function(){
  var _sheet = null;
  function getSheet() {
    if (_sheet) return _sheet;
    var el = document.createElement('style');
    el.id = '__os_overrides';
    document.head.appendChild(el);
    _sheet = el.sheet;
    return _sheet;
  }
  function applyStyles(id, styles) {
    var sheet = getSheet();
    for (var i = sheet.cssRules.length - 1; i >= 0; i--) {
      if (sheet.cssRules[i].selectorText === '[data-os-id="' + id + '"]') {
        sheet.deleteRule(i);
      }
    }
    var keys = Object.keys(styles);
    if (keys.length === 0) return;
    var props = keys.map(function(k) {
      return k.replace(/([A-Z])/g, '-$1').toLowerCase() + ':' + styles[k] + ' !important';
    }).join(';');
    try { sheet.insertRule('[data-os-id="' + id + '"]{' + props + '}', sheet.cssRules.length); } catch(e){}
  }
  function assignIds() {
    var n = 0;
    document.querySelectorAll('body *').forEach(function(el) {
      var t = el.tagName;
      if (t === 'SCRIPT' || t === 'STYLE') return;
      if (!el.dataset.osId) el.dataset.osId = 'os-' + (++n);
    });
  }
  function getStyles(el) {
    var cs = window.getComputedStyle(el);
    return {
      backgroundColor: cs.backgroundColor,
      color: cs.color,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      paddingTop: cs.paddingTop,
      paddingRight: cs.paddingRight,
      paddingBottom: cs.paddingBottom,
      paddingLeft: cs.paddingLeft,
      borderRadius: cs.borderRadius,
      opacity: cs.opacity
    };
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', assignIds);
  } else {
    assignIds();
  }
  document.addEventListener('mouseover', function(e) {
    var el = e.target;
    if (!el || !el.dataset || !el.dataset.osId) return;
    var r = el.getBoundingClientRect();
    window.parent.postMessage({ type:'os:hover', id:el.dataset.osId,
      rect:{left:r.left,top:r.top,width:r.width,height:r.height} }, '*');
  }, true);
  document.addEventListener('mouseout', function() {
    window.parent.postMessage({ type:'os:hover', id:null, rect:null }, '*');
  }, true);
  document.addEventListener('click', function(e) {
    e.preventDefault(); e.stopImmediatePropagation();
    var el = e.target;
    if (!el || !el.dataset || !el.dataset.osId) return;
    var r = el.getBoundingClientRect();
    // Find nearest button/a ancestor so PropertiesPanel can show the play-mode trigger selector
    var navAnc = el.parentElement;
    var navAncData = null;
    while(navAnc && navAnc !== document.body) {
      var navTag = navAnc.tagName && navAnc.tagName.toUpperCase();
      var navRole = navAnc.getAttribute && navAnc.getAttribute('role');
      if(navTag==='A'||navTag==='BUTTON'||navRole==='button'||navRole==='link'){
        var navClass = navAnc.className&&typeof navAnc.className==='string'?navAnc.className.trim():'';
        navAncData = {tagName:navAnc.tagName.toLowerCase(),htmlId:navAnc.id||'',className:navClass};
        break;
      }
      navAnc = navAnc.parentElement;
    }
    window.parent.postMessage({ type:'os:select', id:el.dataset.osId,
      tagName:el.tagName.toLowerCase(),
      htmlId:el.id||'',
      className:el.className&&typeof el.className==='string'?el.className.trim():'',
      rect:{left:r.left,top:r.top,width:r.width,height:r.height},
      computedStyles:getStyles(el),
      isLeaf:el.childElementCount===0,
      textContent:el.childElementCount===0?(el.innerText||''):'',
      navAncestor:navAncData }, '*');
  }, true);
  window.addEventListener('message', function(e) {
    if (!e.data) return;
    if (e.data.type === 'os:apply') applyStyles(e.data.id, e.data.styles || {});
    if (e.data.type === 'os:text') {
      var tel = document.querySelector('[data-os-id="' + e.data.id + '"]');
      if (tel && tel.childElementCount === 0) tel.innerText = e.data.text;
    }
  });
})();
<\/script>`

/** Inject the design mode interaction script into a fully-built srcdoc string. */
export function injectDesignModeScript(html: string): string {
  // Inject into <head> so it registers before NAV_SHIM (which is in <body>)
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${DESIGN_MODE_SCRIPT}\n</head>`)
  }
  return DESIGN_MODE_SCRIPT + '\n' + html
}

/**
 * Parse a previously saved __os_applied style block back into the overrides map format,
 * so accumulated changes can be merged before re-saving.
 */
export function parseExistingOverrides(code: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {}
  const blockMatch = code.match(/<style id="__os_applied">([\s\S]*?)<\/style>/i)
  if (!blockMatch) return result
  const ruleRegex = /\[data-os-id="([^"]+)"\]\s*\{([^}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = ruleRegex.exec(blockMatch[1])) !== null) {
    const id = m[1]
    result[id] = {}
    m[2].split(';').forEach((decl) => {
      const colonIdx = decl.indexOf(':')
      if (colonIdx === -1) return
      const prop = decl.slice(0, colonIdx).trim()
      const val = decl.slice(colonIdx + 1).trim().replace(/\s*!important\s*$/, '').trim()
      if (prop && val) {
        const camelProp = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
        result[id][camelProp] = val
      }
    })
  }
  return result
}

/** Convert the overrides map to a <style> block for permanent embedding in code. */
export function buildOverrideStyleBlock(overrides: Record<string, Record<string, string>>): string {
  const rules = Object.entries(overrides)
    .filter(([, s]) => Object.keys(s).length > 0)
    .map(([id, styles]) => {
      const props = Object.entries(styles)
        .map(([k, v]) => `  ${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v} !important;`)
        .join('\n')
      return `[data-os-id="${id}"] {\n${props}\n}`
    })
    .join('\n')
  if (!rules) return ''
  return `<style id="__os_applied">\n${rules}\n</style>`
}

/** Convert text overrides to a <script> block for permanent embedding in code. */
export function buildTextOverrideScript(textOverrides: Record<string, string>): string {
  const entries = Object.entries(textOverrides).filter(([, t]) => t !== undefined && t !== null)
  if (entries.length === 0) return ''
  const json = JSON.stringify(Object.fromEntries(entries))
  return `<script id="__os_text">(function(){var o=${json};function a(){Object.keys(o).forEach(function(id){var el=document.querySelector('[data-os-id="'+id+'"]');if(el&&el.childElementCount===0)el.innerText=o[id];});}document.readyState==='loading'?document.addEventListener('DOMContentLoaded',a):a();}());<\/script>`
}

// ---------------------------------------------------------------------------
// Thumbnail capture
// ---------------------------------------------------------------------------

const GRAY_PLACEHOLDER =
  'data:image/svg+xml;base64,' +
  btoa('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#1c1c1c"/><text x="400" y="310" text-anchor="middle" fill="#333" font-size="14" font-family="sans-serif">No preview</text></svg>')

/** Try to capture a jpeg thumbnail from an iframe. Falls back to gray placeholder. */
export async function captureThumbnail(iframe: HTMLIFrameElement): Promise<string> {
  try {
    // Dynamic import to avoid bundling html2canvas into initial chunk
    const { default: html2canvas } = await import('html2canvas')
    const doc = iframe.contentDocument
    if (!doc || !doc.body) return GRAY_PLACEHOLDER
    const canvas = await html2canvas(doc.body, {
      width: 800,
      height: 600,
      scale: 0.5,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    })
    return canvas.toDataURL('image/jpeg', 0.7)
  } catch {
    return GRAY_PLACEHOLDER
  }
}
