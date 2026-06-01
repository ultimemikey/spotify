;(function(global){

(function(){
    try {
        const savedTheme = localStorage.getItem("theme") || "system";
        const html = document.documentElement;
        if (savedTheme === "system") {
            const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            if (systemDark) html.classList.add("dark");
        } else if (savedTheme === "dark") {
            html.classList.add("dark");
        }
    } catch(e) {}
})();




class AuraError extends Error{
    constructor(type,msg,line=null,col=null,src=null){
        super(msg);
        this.auraType=type;
        this.line=line;this.col=col;this.src=src;
        this.name='AuraError';
    }
    pretty(){const loc=this.line?` ligne ${this.line}`+(this.col?' col '+this.col:''):'';return `[AuraJS ${this.auraType}]${loc} → ${this.message}`;}
    html(){
        const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const loc=this.line?`<span style="color:#6c7086;font-size:12px">Ligne ${this.line}</span>`:'';
        const src=this.src?`<div style="background:#2a1a1a;padding:5px 10px;border-radius:4px;font-family:monospace;color:#fab387;font-size:12px;margin-top:6px;white-space:pre">${esc(this.src)}</div>`:'';
        return `<div style="background:#2a0a0a;border:1px solid #f38ba8;border-radius:8px;padding:10px 14px;margin:4px 0;font-size:13px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <span style="background:#f38ba8;color:#1e1e2e;border-radius:4px;padding:1px 7px;font-size:11px;font-weight:bold">${esc(this.auraType)}</span>${loc}
            </div>
            <div style="color:#f38ba8;font-weight:600">${esc(this.message)}</div>${src}
        </div>`;
    }
}




const TT={
    NUMBER:'NUMBER',STRING:'STRING',BOOL:'BOOL',NULL:'NULL',
    VAR:'VAR',CONST:'CONST',IDENT:'IDENT',TYPE:'TYPE',
    IF:'IF',ELSE:'ELSE',FOR:'FOR',FOREACH:'FOREACH',WHILE:'WHILE',
    FUNC:'FUNC',CLASS:'CLASS',NEW:'NEW',RETURN:'RETURN',BREAK:'BREAK',
    CONTINUE:'CONTINUE',INCLUDE:'INCLUDE',SHOW:'SHOW',TRY:'TRY',CATCH:'CATCH',
    AS:'AS',EXTENDS:'EXTENDS',EMIT:'EMIT',
    PUBLIC:'PUBLIC',PRIVATE:'PRIVATE',PROTECTED:'PROTECTED',STATIC:'STATIC',
    ASSIGN:'ASSIGN',PLUS:'PLUS',MINUS:'MINUS',STAR:'STAR',SLASH:'SLASH',PERCENT:'PERCENT',
    PLUSEQ:'PLUSEQ',MINUSEQ:'MINUSEQ',STAREQ:'STAREQ',SLASHEQ:'SLASHEQ',
    INC:'INC',DEC:'DEC',
    EQ:'EQ',NEQ:'NEQ',LT:'LT',GT:'GT',LTE:'LTE',GTE:'GTE',
    AND:'AND',OR:'OR',NOT:'NOT',
    LPAREN:'LPAREN',RPAREN:'RPAREN',LBRACE:'LBRACE',RBRACE:'RBRACE',
    LBRACKET:'LBRACKET',RBRACKET:'RBRACKET',
    COMMA:'COMMA',DOT:'DOT',SEMICOLON:'SEMICOLON',COLON:'COLON',ARROW:'ARROW',
    QUESTION:'QUESTION',POWER:'POWER',NULLCOAL:'NULLCOAL',
    HTML:'HTML',EOF:'EOF',
};

const KW={
    'if':TT.IF,'else':TT.ELSE,'for':TT.FOR,'foreach':TT.FOREACH,'while':TT.WHILE,
    'func':TT.FUNC,'class':TT.CLASS,'new':TT.NEW,'return':TT.RETURN,
    'break':TT.BREAK,'continue':TT.CONTINUE,'include':TT.INCLUDE,'show':TT.SHOW,
    'try':TT.TRY,'catch':TT.CATCH,'as':TT.AS,'extends':TT.EXTENDS,'emit':TT.EMIT,
    'public':TT.PUBLIC,'private':TT.PRIVATE,'protected':TT.PROTECTED,'static':TT.STATIC,
    'true':TT.BOOL,'false':TT.BOOL,'null':TT.NULL,
    'int':TT.TYPE,'float':TT.TYPE,'string':TT.TYPE,'bool':TT.TYPE,
    'onMount':TT.IDENT,'onDestroy':TT.IDENT,'onUpdate':TT.IDENT,
};




class Lexer{
    constructor(s){this.s=s;this.p=0;this.line=1;this.tokens=[];}
    peek(o=0){return this.s[this.p+o]||'';}
    adv(){const c=this.s[this.p++];if(c==='\n')this.line++;return c;}
    end(){return this.p>=this.s.length;}
    add(t,v){this.tokens.push({type:t,value:v,line:this.line});}

    tokenize(){
        while(!this.end()){
            this.skip();
            if(this.end())break;
            const c=this.peek();
            if(c==='\n'){this.adv();continue;}
            if(c>='0'&&c<='9'){this.num();continue;}
            if(c==='"'||c==="'"||c==='`'){this.str(c);continue;}
            if(c==='@'){this.adv();this.varTok();continue;}
            if(c==='#'){this.adv();this.constTok();continue;}
            if(this.alpha(c)){this.ident();continue;}
            if(c==='<'&&this.alpha(this.peek(1))){this.htmlTok();continue;}
            this.op();
        }
        this.add(TT.EOF,null);
        return this.tokens;
    }

    skip(){
        while(!this.end()){
            const c=this.peek();
            if(c===' '||c==='\r'||c==='\t'){this.adv();continue;}
            if(c==='/'&&this.peek(1)==='/'){while(!this.end()&&this.peek()!=='\n')this.adv();continue;}
            if(c==='/'&&this.peek(1)==='*'){this.adv();this.adv();while(!this.end()&&!(this.peek()==='*'&&this.peek(1)==='/'))this.adv();this.adv();this.adv();continue;}
            break;
        }
    }

    num(){
        let n='';
        while(!this.end()&&((this.peek()>='0'&&this.peek()<='9')||this.peek()==='.'))n+=this.adv();
        this.add(TT.NUMBER,n.includes('.')?parseFloat(n):parseInt(n));
    }

    str(q){
        this.adv();let s='';
        while(!this.end()&&this.peek()!==q){
            if(this.peek()==='\\'){this.adv();const e=this.adv();s+=e==='n'?'\n':e==='t'?'\t':e;}
            else s+=this.adv();
        }
        this.adv();
        this.add(TT.STRING,s.includes('@')?{ipl:true,raw:s}:s);
    }

    varTok(){let n='';while(!this.end()&&(this.alnum(this.peek())||this.peek()==='_'))n+=this.adv();this.add(TT.VAR,n);}
    constTok(){let n='';while(!this.end()&&(this.alnum(this.peek())||this.peek()==='_'))n+=this.adv();this.add(TT.CONST,n);}

    ident(){
        let w='';
        while(!this.end()&&(this.alnum(this.peek())||this.peek()==='_'))w+=this.adv();
        const t=KW[w]??TT.IDENT;
        this.add(t,t===TT.BOOL?w==='true':w);
    }

    htmlTok(){
        let s='<';
        this.adv();
        let tag='';
        while(!this.end()&&this.peek()!=='>'&&this.peek()!==' '&&this.peek()!=='/')tag+=this.adv();
        while(!this.end()&&this.peek()!=='>')s+=this.adv();
        if(!this.end()){s+=this.adv();}
        s=s.replace('<',`<${tag}`);
        if(s.endsWith('/>')){this.add(TT.HTML,s);return;}
        const close=`</${tag}>`;
        let depth=1;
        while(!this.end()&&depth>0){
            if(this.s.slice(this.p,this.p+tag.length+2)===`<${tag}`){depth++;}
            if(this.s.slice(this.p,this.p+close.length)===close){
                depth--;
                if(depth===0){for(let i=0;i<close.length;i++)s+=this.adv();break;}
            }
            s+=this.adv();
        }
        this.add(TT.HTML,s);
    }

    op(){
        const c=this.adv();
        if(c==='?'&&this.peek()==='?'){this.adv();this.add(TT.NULLCOAL,'??');return;}
        const m={'(':TT.LPAREN,')':TT.RPAREN,'{':TT.LBRACE,'}':TT.RBRACE,
                 '[':TT.LBRACKET,']':TT.RBRACKET,',':TT.COMMA,'.':TT.DOT,
                 ';':TT.SEMICOLON,':':TT.COLON,'%':TT.PERCENT,'?':TT.QUESTION};
        if(m[c]){this.add(m[c],c);return;}
        if(c==='!'){this.peek()==='='?(this.adv(),this.add(TT.NEQ,'!=')):this.add(TT.NOT,'!');return;}
        if(c==='='){if(this.peek()==='='){this.adv();this.add(TT.EQ,'==');}else if(this.peek()==='>'){this.adv();this.add(TT.ARROW,'=>');}else this.add(TT.ASSIGN,'=');return;}
        if(c==='<'){this.peek()==='='?(this.adv(),this.add(TT.LTE,'<=')):this.add(TT.LT,'<');return;}
        if(c==='>'){this.peek()==='='?(this.adv(),this.add(TT.GTE,'>=')):this.add(TT.GT,'>');return;}
        if(c==='+'){this.peek()==='+'?(this.adv(),this.add(TT.INC,'++')):(this.peek()==='='?(this.adv(),this.add(TT.PLUSEQ,'+=')):(this.add(TT.PLUS,'+')));return;}
        if(c==='-'){this.peek()==='-'?(this.adv(),this.add(TT.DEC,'--')):(this.peek()==='='?(this.adv(),this.add(TT.MINUSEQ,'-=')):(this.add(TT.MINUS,'-')));return;}
        if(c==='*'){if(this.peek()==='*'){this.adv();this.add(TT.POWER,'**');return;}this.peek()==='='?(this.adv(),this.add(TT.STAREQ,'*=')):this.add(TT.STAR,'*');return;}
        if(c==='/'){this.peek()==='='?(this.adv(),this.add(TT.SLASHEQ,'/=')):this.add(TT.SLASH,'/');return;}
        if(c==='&'&&this.peek()==='&'){this.adv();this.add(TT.AND,'&&');return;}
        if(c==='|'&&this.peek()==='|'){this.adv();this.add(TT.OR,'||');return;}
    }

    alpha(c){return(c>='a'&&c<='z')||(c>='A'&&c<='Z')||c==='_';}
    alnum(c){return this.alpha(c)||(c>='0'&&c<='9');}
    getLine(n){return this.s.split('\n')[n-1]||'';}
}




const N={
    Program:b=>({type:'Program',body:b}),
    VarDecl:(n,v,vt)=>({type:'VarDecl',name:n,value:v,varType:vt}),
    ConstDecl:(n,v,vt)=>({type:'ConstDecl',name:n,value:v,varType:vt}),
    Assign:(n,v,op)=>({type:'Assign',name:n,value:v,op}),
    PropAssign:(o,p,v)=>({type:'PropAssign',obj:o,prop:p,value:v}),
    IndexAssign:(n,i,v)=>({type:'IndexAssign',name:n,index:i,value:v}),
    IncDec:(n,op)=>({type:'IncDec',name:n,op}),
    Show:v=>({type:'Show',value:v}),
    Set:(s,v)=>({type:'Set',selector:s,value:v}),
    Include:f=>({type:'Include',file:f}),
    Emit:(ev,d)=>({type:'Emit',event:ev,data:d}),
    If:(c,t,e)=>({type:'If',cond:c,then:t,els:e}),
    For:(i,c,s,b)=>({type:'For',init:i,cond:c,step:s,body:b}),
    Foreach:(a,it,b)=>({type:'Foreach',arr:a,item:it,body:b}),
    ForeachKV:(o,k,v,b)=>({type:'ForeachKV',obj:o,key:k,val:v,body:b}),
    While:(c,b)=>({type:'While',cond:c,body:b}),
    Switch:(e,cs,d)=>({type:'Switch',expr:e,cases:cs,default:d}),
    FuncDecl:(n,p,b,m)=>({type:'FuncDecl',name:n,params:p,body:b,mod:m}),
    AnonFunc:(p,b)=>({type:'AnonFunc',params:p,body:b}),
    ClassDecl:(n,par,b,m)=>({type:'ClassDecl',name:n,parent:par,body:b,mod:m}),
    Return:v=>({type:'Return',value:v}),
    Break:()=>({type:'Break'}),
    Continue:()=>({type:'Continue'}),
    TryCatch:(t,ev,c)=>({type:'TryCatch',tryBody:t,errVar:ev,catchBody:c}),
    On:(ev,sel,b)=>({type:'On',event:ev,selector:sel,body:b}),
    Call:(n,a,r)=>({type:'Call',name:n,args:a,ref:r||null}),
    MethodCall:(o,m,a)=>({type:'MethodCall',obj:o,method:m,args:a}),
    NewExpr:(c,a)=>({type:'NewExpr',cls:c,args:a}),
    BinOp:(l,op,r)=>({type:'BinOp',left:l,op,right:r}),
    UnaryOp:(op,e)=>({type:'UnaryOp',op,expr:e}),
    Ternary:(c,t,e)=>({type:'Ternary',cond:c,then:t,els:e}),
    NullCoal:(l,r)=>({type:'NullCoal',left:l,right:r}),
    Literal:v=>({type:'Literal',value:v}),
    InterpStr:p=>({type:'InterpStr',parts:p}),
    VarRef:n=>({type:'VarRef',name:n}),
    ConstRef:n=>({type:'ConstRef',name:n}),
    Member:(o,p)=>({type:'Member',obj:o,prop:p}),
    Index:(o,i)=>({type:'Index',obj:o,index:i}),
    Arr:e=>({type:'Arr',elements:e}),
    Obj:p=>({type:'Obj',pairs:p}),
};




class Parser{
    constructor(tok,src=''){this.tok=tok;this.p=0;this._src=src;}
    peek(o=0){return this.tok[this.p+o]||{type:TT.EOF,value:null};}
    adv(){return this.tok[this.p++]||{type:TT.EOF,value:null};}
    end(){return this.peek().type===TT.EOF;}
    is(t){return this.peek().type===t;}
    eat(...ts){for(const t of ts)if(this.is(t)){this.adv();return true;}return false;}
    need(t,msg){
        if(!this.is(t)){
            const tok=this.peek();const line=tok.line||null;
            const src=this._src?this._src.split('\n')[(line||1)-1]:'';
            throw new AuraError('ParseError',`${msg} attendu — trouvé "${tok.value!==null?tok.value:'fin de fichier'}"`,line,null,src);
        }
        return this.adv();
    }

    parse(){const b=[];while(!this.end()){const s=this.stmt();if(s)b.push(s);}return N.Program(b);}

    block(){
        this.need(TT.LBRACE,'"{"');
        const b=[];
        while(!this.end()&&!this.is(TT.RBRACE)){const s=this.stmt();if(s)b.push(s);}
        this.need(TT.RBRACE,'"}"');
        return b;
    }

    stmt(){
        const t=this.peek().type,v=this.peek().value;
        if(t===TT.IF)       return this.pIf();
        if(t===TT.FOR)      return this.pFor();
        if(t===TT.FOREACH)  return this.pForeach();
        if(t===TT.WHILE)    return this.pWhile();
        if(t===TT.FUNC)     return this.pFunc();
        if(t===TT.TRY)      return this.pTry();
        if(t===TT.EMIT)     return this.pEmit();
        if(t===TT.RETURN)   {this.adv();return N.Return(this.end()||this.is(TT.RBRACE)?N.Literal(null):this.expr());}
        if(t===TT.BREAK)    {this.adv();return N.Break();}
        if(t===TT.CONTINUE) {this.adv();return N.Continue();}
        if(t===TT.INCLUDE)  {this.adv();const f=this.need(TT.STRING,'"file"').value;return N.Include(typeof f==='object'?f.raw:f);}
        
        if(t===TT.SHOW){
    this.adv();this.need(TT.LPAREN,'"("');
    const parts=[];
    while(!this.is(TT.RPAREN)&&!this.end()){
        parts.push(this.expr());
        if(!this.eat(TT.COMMA))break;
    }
    this.need(TT.RPAREN,'")"');
    const val=parts.length===1?parts[0]:parts.reduce((a,b)=>N.BinOp(a,'+',N.BinOp(N.Literal(' '),'+',b)));
    return N.Show(val);
}


        if(t===TT.VAR)      return this.pVar();
        if(t===TT.CONST)    return this.pConst();
        if(t===TT.PUBLIC||t===TT.PRIVATE||t===TT.PROTECTED||t===TT.STATIC) return this.pMod();
        if(t===TT.CLASS)    return this.pClass();
        if(t===TT.NEW)      return this.pNew();
        if(t===TT.IDENT&&v==='on')     return this.pOn();
        if(t===TT.IDENT&&v==='set')    return this.pSet();
        if(t===TT.IDENT&&v==='switch') return this.pSwitch();
        if(t===TT.IDENT&&v==='onMount')   return this.pLifecycle('onMount');
        if(t===TT.IDENT&&v==='onDestroy') return this.pLifecycle('onDestroy');
        if(t===TT.IDENT&&v==='onUpdate')  return this.pLifecycle('onUpdate');
        if(t===TT.IDENT)    return this.pIdent();
        if(t===TT.HTML)     {const val=this.adv().value;return N.Show(N.Literal(val));}
        this.adv();return null;
    }

    pEmit(){
        this.adv();
        this.need(TT.LPAREN,'"("');
        const ev=this.expr();
        let data=N.Literal(null);
        if(this.eat(TT.COMMA))data=this.expr();
        this.need(TT.RPAREN,'")"');
        return N.Emit(ev,data);
    }

    pLifecycle(hook){
        this.adv();
        return {type:'Lifecycle',hook,body:this.block()};
    }

    pTyped(){
        const vt=this.adv().value;
        if(this.is(TT.VAR))  {const n=this.adv().value;this.need(TT.ASSIGN,'"="');return N.VarDecl(n,this.expr(),vt);}
        if(this.is(TT.CONST)){const n=this.adv().value;this.need(TT.ASSIGN,'"="');return N.ConstDecl(n,this.expr(),vt);}
        return null;
    }

    pVar(){
        const n=this.adv().value;
        if(this.is(TT.INC)){this.adv();return N.IncDec(n,'++');}
        if(this.is(TT.DEC)){this.adv();return N.IncDec(n,'--');}
        if(this.is(TT.DOT)){
            let base=N.VarRef(n);
            while(this.is(TT.DOT)){
                this.adv();
                const prop=this.need(TT.IDENT,'prop').value;
                if(this.is(TT.LPAREN)){this.adv();const args=this.args();this.need(TT.RPAREN,'")"');base=N.MethodCall(base,prop,args);continue;}
                if(this.is(TT.ASSIGN)){this.adv();return N.PropAssign(n,prop,this.expr());}
                base=N.Member(base,prop);
            }
            const cops={[TT.PLUSEQ]:'+=', [TT.MINUSEQ]:'-=', [TT.STAREQ]:'*=', [TT.SLASHEQ]:'/='};
            if(cops[this.peek().type]){const op=this.adv().value;return N.Assign(n,this.expr(),op);}
            return base;
        }
        if(this.is(TT.LBRACKET)){
            this.adv();const i=this.expr();this.need(TT.RBRACKET,'"]"');
            this.need(TT.ASSIGN,'"="');
            return N.IndexAssign(n,i,this.expr());
        }
        const cops={[TT.PLUSEQ]:'+=', [TT.MINUSEQ]:'-=', [TT.STAREQ]:'*=', [TT.SLASHEQ]:'/='};
        if(cops[this.peek().type]){const op=this.adv().value;return N.Assign(n,this.expr(),op);}
        if(this.is(TT.ASSIGN)){this.adv();return N.VarDecl(n,this.expr(),null);}
        return N.VarRef(n);
    }

    pConst(){const n=this.adv().value;this.need(TT.ASSIGN,'"="');return N.ConstDecl(n,this.expr(),null);}

    pIf(){
        this.adv();
        this.need(TT.LPAREN,'"("');const c=this.expr();this.need(TT.RPAREN,'")"');
        const then=this.block();let els=null;
        if(this.is(TT.ELSE)){
            this.adv();
            if(this.is(TT.IF))els=[this.pIf()];
            else els=this.block();
        }
        return N.If(c,then,els);
    }

    pFor(){
        this.adv();this.need(TT.LPAREN,'"("');
        const vn=this.need(TT.VAR,'"@var"').value;
        this.need(TT.ASSIGN,'"="');const iv=this.expr();
        const init=N.VarDecl(vn,iv,'int');
        this.eat(TT.SEMICOLON);const cond=this.expr();
        this.eat(TT.SEMICOLON);const sn=this.need(TT.VAR,'"@var"').value;
        let step;
        if(this.is(TT.INC)){this.adv();step=N.IncDec(sn,'++');}
        else if(this.is(TT.DEC)){this.adv();step=N.IncDec(sn,'--');}
        else if(this.is(TT.PLUSEQ)){this.adv();step=N.Assign(sn,this.expr(),'+=');}
        else if(this.is(TT.MINUSEQ)){this.adv();step=N.Assign(sn,this.expr(),'-=');}
        this.need(TT.RPAREN,'")"');
        return N.For(init,cond,step,this.block());
    }

    pForeach(){
        this.adv();this.need(TT.LPAREN,'"("');
        const arr=this.need(TT.VAR,'"@var"').value;
        this.need(TT.AS,'"as"');
        const first=this.need(TT.VAR,'"@var"').value;
        if(this.is(TT.ARROW)){
            this.adv();const val=this.need(TT.VAR,'"@val"').value;
            this.need(TT.RPAREN,'")"');
            return N.ForeachKV(arr,first,val,this.block());
        }
        this.need(TT.RPAREN,'")"');
        return N.Foreach(arr,first,this.block());
    }

    pWhile(){
        this.adv();this.need(TT.LPAREN,'"("');const c=this.expr();this.need(TT.RPAREN,'")"');
        return N.While(c,this.block());
    }

    pSwitch(){
        this.adv();
        this.need(TT.LPAREN,'"("');const expr=this.expr();this.need(TT.RPAREN,'")"');
        this.need(TT.LBRACE,'"{"');
        const cases=[];let def=null;
        while(!this.is(TT.RBRACE)&&!this.end()){
            if(this.peek().type===TT.IDENT&&this.peek().value==='case'){
                this.adv();const val=this.expr();const body=this.block();cases.push({val,body});
            } else if(this.peek().type===TT.IDENT&&this.peek().value==='default'){
                this.adv();def=this.block();
            } else this.adv();
        }
        this.need(TT.RBRACE,'"}"');
        return N.Switch(expr,cases,def);
    }

    pFunc(mod=null){
        this.adv();
        const n=this.need(TT.IDENT,'nom func').value;
        this.need(TT.LPAREN,'"("');
        const params=this.pParams();
        this.need(TT.RPAREN,'")"');
        return N.FuncDecl(n,params,this.block(),mod);
    }

    pAnonFunc(){
        this.adv();
        this.need(TT.LPAREN,'"("');
        const params=this.pParams();
        this.need(TT.RPAREN,'")"');
        return N.AnonFunc(params,this.block());
    }

    pParams(){
        const p=[];
        while(!this.is(TT.RPAREN)&&!this.end()){
            if(this.is(TT.TYPE)&&this.peek(1).type===TT.VAR)this.adv();
            if(this.is(TT.VAR))p.push(this.adv().value);
            else if(this.is(TT.TYPE))p.push(this.adv().value);
            if(!this.eat(TT.COMMA))break;
        }
        return p;
    }

    pClass(mod=null){
        this.adv();
        const n=this.need(TT.IDENT,'nom class').value;
        let par=null;
        if(this.is(TT.EXTENDS)){this.adv();par=this.adv().value;}
        return N.ClassDecl(n,par,this.block(),mod);
    }

    pMod(){
        const m=this.adv().value;
        if(this.is(TT.CLASS))return this.pClass(m);
        if(this.is(TT.FUNC)) return this.pFunc(m);
        return null;
    }

    pTry(){
        this.adv();const t=this.block();
        let ev='__error';let c=[];
        if(this.is(TT.CATCH)){
            this.adv();
            if(this.is(TT.LPAREN)){
                this.adv();
                if(this.is(TT.VAR))ev=this.adv().value;
                this.need(TT.RPAREN,'")"');
            }
            c=this.block();
        }
        return N.TryCatch(t,ev,c);
    }

    pNew(){
        this.adv();
        const cls=this.need(TT.IDENT,'nom class').value;
        this.need(TT.LPAREN,'"("');const args=this.args();this.need(TT.RPAREN,'")"');
        return N.NewExpr(cls,args);
    }

    pOn(){
        this.adv();
        this.need(TT.LPAREN,'"("');
        const ev=this.need(TT.STRING,'event');
        const evv=typeof ev.value==='object'?ev.value.raw:ev.value;
        this.need(TT.COMMA,'","');
        const sel=this.need(TT.STRING,'selector');
        const selv=typeof sel.value==='object'?sel.value.raw:sel.value;
        this.need(TT.RPAREN,'")"');
        return N.On(evv,selv,this.block());
    }

    pSet(){
        this.adv();
        this.need(TT.LPAREN,'"("');
        const sel=this.expr();
        this.need(TT.COMMA,'","');
        const val=this.expr();
        this.need(TT.RPAREN,'")"');
        return N.Set(sel,val);
    }

    pIdent(){
    const n=this.peek().value;

    
    if(this.tok[this.p+1]?.type===TT.LPAREN){
        this.adv();this.adv();
        const args=this.args();
        this.need(TT.RPAREN,'")"');
        return N.Call(n,args,null);
    }

    
    if(this.tok[this.p+1]?.type===TT.DOT){
        this.adv(); 
        let base=N.Literal(n);

        while(this.is(TT.DOT)){
            this.adv(); 
            const prop=this.need(TT.IDENT,'méthode').value;

            
            if(this.is(TT.LPAREN)){
                this.adv();
                const args=this.args();
                this.need(TT.RPAREN,'")"');
                base=N.MethodCall(base,prop,args);
                continue;
            }

            
            if(this.is(TT.ASSIGN)){
                this.adv();
                return N.PropAssign(n,prop,this.expr());
            }

            
            const cops={[TT.PLUSEQ]:'+=', [TT.MINUSEQ]:'-=', [TT.STAREQ]:'*=', [TT.SLASHEQ]:'/='};
            if(cops[this.peek().type]){
                const op=this.adv().value;
                return N.PropAssign(n,prop,N.BinOp(N.Member(base,prop),op[0],this.expr()));
            }

            
            base=N.Member(base,prop);
        }

        return base;
    }

    this.adv();return null;
}


    args(){
        const a=[];
        while(!this.is(TT.RPAREN)&&!this.end()){
            if(this.is(TT.FUNC))a.push(this.pAnonFunc());
            else a.push(this.expr());
            if(!this.eat(TT.COMMA))break;
        }
        return a;
    }

    expr(){return this.nullCoal();}
    nullCoal(){let e=this.ternary();while(this.is(TT.NULLCOAL)){this.adv();e=N.NullCoal(e,this.ternary());}return e;}
    ternary(){
        let e=this.or();
        if(this.is(TT.QUESTION)){
            this.adv();const t=this.or();
            this.need(TT.COLON,'":"');
            return N.Ternary(e,t,this.ternary());
        }
        return e;
    }
    or()    {let l=this.and();   while(this.is(TT.OR)){const op=this.adv().value;l=N.BinOp(l,op,this.and());}return l;}
    and()   {let l=this.eq();    while(this.is(TT.AND)){const op=this.adv().value;l=N.BinOp(l,op,this.eq());}return l;}
    eq()    {let l=this.cmp();   while(this.is(TT.EQ)||this.is(TT.NEQ)){const op=this.adv().value;l=N.BinOp(l,op,this.cmp());}return l;}
    cmp()   {let l=this.add();   while([TT.LT,TT.GT,TT.LTE,TT.GTE].includes(this.peek().type)){const op=this.adv().value;l=N.BinOp(l,op,this.add());}return l;}
    add()   {let l=this.mul();   while(this.is(TT.PLUS)||this.is(TT.MINUS)){const op=this.adv().value;l=N.BinOp(l,op,this.mul());}return l;}
    mul()   {let l=this.power(); while(this.is(TT.STAR)||this.is(TT.SLASH)||this.is(TT.PERCENT)){const op=this.adv().value;l=N.BinOp(l,op,this.power());}return l;}
    power() {let l=this.unary(); if(this.is(TT.POWER)){this.adv();return N.BinOp(l,'**',this.power());}return l;}
    unary(){
        if(this.is(TT.NOT)){const op=this.adv().value;return N.UnaryOp(op,this.unary());}
        if(this.is(TT.MINUS)){this.adv();return N.UnaryOp('-',this.unary());}
        return this.postfix();
    }
    postfix(){
        let e=this.primary();
        while(true){
            if(this.is(TT.DOT)){
                this.adv();const prop=this.need(TT.IDENT,'prop').value;
                if(this.is(TT.LPAREN)){this.adv();const a=this.args();this.need(TT.RPAREN,'")"');e=N.MethodCall(e,prop,a);}
                else e=N.Member(e,prop);
                continue;
            }
            if(this.is(TT.LBRACKET)){
                this.adv();const i=this.expr();this.need(TT.RBRACKET,'"]"');
                e=N.Index(e,i);continue;
            }
            if(e.type==='VarRef'&&this.is(TT.LPAREN)){
                const ref=e;this.adv();const a=this.args();this.need(TT.RPAREN,'")"');
                e=N.Call('__invoke',a,ref);continue;
            }
            break;
        }
        return e;
    }
    primary(){
        const t=this.peek();
        if(t.type===TT.NUMBER){this.adv();return N.Literal(t.value);}
        if(t.type===TT.STRING){
            this.adv();
            if(t.value&&typeof t.value==='object'&&t.value.ipl)return this.buildInterp(t.value.raw);
            return N.Literal(t.value);
        }
        if(t.type===TT.BOOL)  {this.adv();return N.Literal(t.value);}
        if(t.type===TT.NULL)  {this.adv();return N.Literal(null);}
        if(t.type===TT.VAR)   {this.adv();return N.VarRef(t.value);}
        if(t.type===TT.CONST) {this.adv();return N.ConstRef(t.value);}
        if(t.type===TT.NEW)   {return this.pNew();}
        if(t.type===TT.FUNC)  {return this.pAnonFunc();}
        if(t.type===TT.LBRACKET){
            this.adv();const els=[];
            while(!this.is(TT.RBRACKET)&&!this.end()){els.push(this.expr());if(!this.eat(TT.COMMA))break;}
            this.need(TT.RBRACKET,'"]"');return N.Arr(els);
        }
        if(t.type===TT.LBRACE){
            this.adv();const pairs=[];
            while(!this.is(TT.RBRACE)&&!this.end()){
                const k=this.adv().value;
                this.eat(TT.ASSIGN)||this.eat(TT.COLON);
                const v=this.expr();pairs.push({key:k,val:v});
                if(!this.eat(TT.COMMA))break;
            }
            this.need(TT.RBRACE,'"}"');return N.Obj(pairs);
        }
        if(t.type===TT.LPAREN){this.adv();const e=this.expr();this.need(TT.RPAREN,'")"');return e;}
        if(t.type===TT.IDENT){
            this.adv();
            if(this.is(TT.LPAREN)){this.adv();const a=this.args();this.need(TT.RPAREN,'")"');return N.Call(t.value,a,null);}
            return N.Literal(t.value);
        }
        this.adv();return N.Literal(null);
    }

    buildInterp(raw){
        const parts=[];
        const re=/(?<![a-zA-Z0-9.])@([a-zA-Z_]\w*)(?:\.([a-zA-Z_]\w*))?/g;
        let last=0,m;
        while((m=re.exec(raw))!==null){
            if(m.index>last)parts.push(N.Literal(raw.slice(last,m.index)));
            if(m[2]) parts.push(N.Member(N.VarRef(m[1]),m[2]));
            else     parts.push(N.VarRef(m[1]));
            last=m.index+m[0].length;
        }
        if(last<raw.length)parts.push(N.Literal(raw.slice(last)));
        if(parts.length===1&&parts[0].type==='Literal')return parts[0];
        return N.InterpStr(parts);
    }
}




const Store={
    _data:{},
    _subs:{},
    set(k,v){
        this._data[k]=v;
        (this._subs[k]||[]).forEach(fn=>fn(v));
    },
    get(k){return this._data[k]??null;},
    delete(k){delete this._data[k];},
    subscribe(k,fn){
        if(!this._subs[k])this._subs[k]=[];
        this._subs[k].push(fn);
        return ()=>this._subs[k]=this._subs[k].filter(f=>f!==fn);
    },
    clear(){this._data={};this._subs={};}
};




class Scope{
    constructor(par=null){this.v={};this.par=par;}
    get(n){if(n in this.v)return this.v[n];return this.par?this.par.get(n):undefined;}
    set(n,v){if(n in this.v){this.v[n]=v;return;}if(this.par?.has(n)){this.par.set(n,v);return;}this.v[n]=v;}
    setL(n,v){this.v[n]=v;}
    has(n){return n in this.v||(this.par?.has(n)??false);}
}
class Sig{constructor(t,v){this.t=t;this.v=v;}}




class Runtime{
    constructor(mods={}){
        this.g=new Scope();this.consts={};this.funcs={};this.classes={};
        this.out=[];this.mods=mods;this.onInc=null;this._evts=[];
        this._reactiveEls=[];
        this._compEmitHandlers={};
        Object.entries(mods).forEach(([k,v])=>this.g.setL(k,v));
    }

    run(ast){return this.exec(ast,this.g);}

    setReactive(name,value,sc){
        sc.set(name,value);
        this.g.v[name]=value;
        this._updateReactive(name,value);
    }

    _updateReactive(name,value){
        this._reactiveEls.forEach(({varName,el,attr})=>{
            if(varName!==name)return;
            if(attr==='text')el.textContent=String(value??'');
            else if(attr==='html')el.innerHTML=String(value??'');
            else if(attr==='value')el.value=String(value??'');
            else if(attr==='show')el.style.display=value?'':'none';
        });
    }

    registerReactive(varName,el,attr='text'){
        this._reactiveEls.push({varName,el,attr});
    }

    exec(node,sc){
        if(!node)return null;
        switch(node.type){
            case 'Program':    return this.blk(node.body,sc);
            case 'VarDecl':    {
                const v=this.cast(node.varType,this.ev(node.value,sc));
                sc.setL(node.name,v);this.g.v[node.name]=v;
                this._updateReactive(node.name,v);
                return null;
            }
            case 'ConstDecl':  {this.consts[node.name]=this.cast(node.varType,this.ev(node.value,sc));return null;}
            case 'Assign':     {
                let c=sc.get(node.name)??0,r=this.ev(node.value,sc);
                switch(node.op){
                    case'+=':c=typeof c==='string'?c+String(r):c+r;break;
                    case'-=':c-=r;break;case'*=':c*=r;break;case'/=':c=r?c/r:0;break;
                    default:c=r;
                }
                sc.set(node.name,c);this.g.v[node.name]=c;
                this._updateReactive(node.name,c);
                return null;
            }
            case 'PropAssign': {const o=sc.get(node.obj);if(o&&typeof o==='object')o[node.prop]=this.ev(node.value,sc);return null;}
            case 'IndexAssign':{const a=sc.get(node.name);if(a!=null){a[this.ev(node.index,sc)]=this.ev(node.value,sc);sc.set(node.name,a);}return null;}
            case 'IncDec':     {
                const c=sc.get(node.name)??0;
                const nv=node.op==='++'?c+1:c-1;
                sc.set(node.name,nv);this.g.v[node.name]=nv;
                this._updateReactive(node.name,nv);
                return null;
            }
            case 'Show':       {
                let val=String(this.ev(node.value,sc)??'');
                val=val.replace(/(?<![a-zA-Z0-9.])@([a-zA-Z_]\w*)(?:\.([a-zA-Z_]\w*))?/g,(_,n,p)=>{
                    const v=sc.get(n)??null;
                    if(p)return v&&v[p]!=null?String(v[p]):'';
                    return v!=null?String(v):'';
                });
                this.out.push(val);return null;
            }
            case 'Set':        {
                const sel=this.ev(node.selector,sc);
                const val=String(this.ev(node.value,sc)??'');
                const el=document.querySelector(sel);
                if(el)el.innerHTML=val;
                return null;
            }
            case 'Emit':       {
                const ev=this.ev(node.event,sc);
                const data=this.ev(node.data,sc);
                const handlers=this._compEmitHandlers[ev]||[];
                handlers.forEach(fn=>fn(data));
                document.dispatchEvent(new CustomEvent('aura:'+ev,{detail:data}));
                return null;
            }
            case 'Lifecycle':  return null;
            case 'Include':    {if(this.onInc)this.onInc(node.file);return null;}
            case 'If':         {
                if(this.ev(node.cond,sc))return this.blk(node.then,new Scope(sc));
                if(node.els)return this.blk(node.els,new Scope(sc));
                return null;
            }
            case 'For':        {
                const fs=new Scope(sc);this.exec(node.init,fs);let mx=1e6;
                while(mx--&&this.ev(node.cond,fs)){
                    const r=this.blk(node.body,new Scope(fs));
                    if(r instanceof Sig){if(r.t==='break')break;if(r.t==='continue'){this.exec(node.step,fs);continue;}if(r.t==='return')return r;}
                    this.exec(node.step,fs);
                }
                return null;
            }
            case 'Foreach':    {
                const arr=sc.get(node.arr)??[];if(!Array.isArray(arr))return null;
                for(const item of arr){
                    const ls=new Scope(sc);ls.setL(node.item,item);
                    const r=this.blk(node.body,ls);
                    if(r instanceof Sig){if(r.t==='break')break;if(r.t==='continue')continue;if(r.t==='return')return r;}
                }
                return null;
            }
            case 'ForeachKV':  {
                const obj=sc.get(node.obj)??{};
                const entries=Array.isArray(obj)?obj.map((v,i)=>[i,v]):Object.entries(obj);
                for(const [k,v] of entries){
                    const ls=new Scope(sc);ls.setL(node.key,k);ls.setL(node.val,v);
                    const r=this.blk(node.body,ls);
                    if(r instanceof Sig){if(r.t==='break')break;if(r.t==='continue')continue;if(r.t==='return')return r;}
                }
                return null;
            }
            case 'While':      {
                let mx=1e6;
                while(mx--&&this.ev(node.cond,sc)){
                    const r=this.blk(node.body,new Scope(sc));
                    if(r instanceof Sig){if(r.t==='break')break;if(r.t==='continue')continue;if(r.t==='return')return r;}
                }
                return null;
            }
            case 'Switch':     {
                const val=this.ev(node.expr,sc);let hit=false;
                for(const c of node.cases){
                    if(this.ev(c.val,sc)==val){hit=true;const r=this.blk(c.body,new Scope(sc));if(r instanceof Sig)return r;break;}
                }
                if(!hit&&node.default)this.blk(node.default,new Scope(sc));
                return null;
            }
            case 'FuncDecl':   this.funcs[node.name]=node;return null;
            case 'ClassDecl':  this.classes[node.name]=node;return null;
            case 'Return':     return new Sig('return',this.ev(node.value,sc));
            case 'Break':      return new Sig('break',null);
            case 'Continue':   return new Sig('continue',null);
            case 'TryCatch':   {
                try{this.blk(node.tryBody,new Scope(sc));}
                catch(e){const cs=new Scope(sc);cs.setL(node.errVar||'__error',e.message);this.blk(node.catchBody,cs);}
                return null;
            }
            case 'On':         {this._evts.push({evt:node.event,sel:node.selector,body:node.body,sc});return null;}
            case 'Call':       return this.call(node.name,node.args,sc,node.ref);
            case 'MethodCall': {
    let o = this.ev(node.obj, sc);
    
    if(o === 'self' || (node.obj.type === 'Literal' && node.obj.value === 'self')) {
        o = sc.get('self');
    }
    return this.callM(o, node.method, node.args, sc);
}
            case 'NewExpr':    return this.newInst(node.cls,node.args,sc);
            default: return null;
        }
    }

    blk(nodes,sc){for(const n of nodes){const r=this.exec(n,sc);if(r instanceof Sig)return r;}return null;}

    ev(node,sc){
        if(!node)return null;
        switch(node.type){
            case 'Literal':    return node.value;
            case 'VarRef':     return sc.get(node.name)??null;
            case 'ConstRef':   return this.consts[node.name]??null;
            case 'AnonFunc':   return {__anon:true,params:node.params,body:node.body,scope:sc};
            case 'Arr':        return node.elements.map(e=>this.ev(e,sc));
            case 'Obj':        {const o={};node.pairs.forEach(({key,val})=>o[key]=this.ev(val,sc));return o;}
            case 'Member': {
    let o = this.ev(node.obj, sc);
    
    if(o === 'self' || (node.obj.type === 'Literal' && node.obj.value === 'self')) {
        o = sc.get('self');
    }
    return o == null ? null : o[node.prop] ?? null;
}
            case 'Index':      {const o=this.ev(node.obj,sc);const i=this.ev(node.index,sc);return o==null?null:o[i]??null;}
            case 'InterpStr':  return node.parts.map(p=>this.ev(p,sc)??'').join('');
            case 'NullCoal':   {const l=this.ev(node.left,sc);return(l!==null&&l!==undefined)?l:this.ev(node.right,sc);}
            case 'BinOp':{
                const L=this.ev(node.left,sc),R=this.ev(node.right,sc);
                switch(node.op){
                    case '+':return typeof L==='string'||typeof R==='string'?String(L??'')+String(R??''):L+R;
                    case '-':return L-R;case '*':return L*R;
                    case '/':if(R===0)throw new AuraError('RuntimeError','Division par zéro');return L/R;
                    case '%':return L%R;case '**':return Math.pow(L,R);
                    case '==':return L==R;case '!=':return L!=R;
                    case '<':return L<R;case '>':return L>R;
                    case '<=':return L<=R;case '>=':return L>=R;
                    case '&&':return L&&R;case '||':return L||R;
                }
                return null;
            }
            case 'UnaryOp':    {const v=this.ev(node.expr,sc);return node.op==='!'?!v:node.op==='-'?-v:v;}
            case 'Ternary':    return this.ev(node.cond,sc)?this.ev(node.then,sc):this.ev(node.els,sc);
            case 'Call':       return this.call(node.name,node.args,sc,node.ref);
            case 'MethodCall': {const o=this.ev(node.obj,sc);return this.callM(o,node.method,node.args,sc);}
            case 'NewExpr':    return this.newInst(node.cls,node.args,sc);
            default: return null;
        }
    }

    invokeAnon(fn,args){
        const fs=new Scope(fn.scope||this.g);
        fn.params.forEach((p,i)=>fs.setL(p,args[i]??null));
        const r=this.blk(fn.body,fs);
        return r instanceof Sig&&r.t==='return'?r.v:null;
    }

    call(name,argNodes,sc,ref=null){
        const args=argNodes.map(a=>this.ev(a,sc));
        if(name==='__invoke'&&ref){const fn=this.ev(ref,sc);if(fn&&fn.__anon)return this.invokeAnon(fn,args);}
        if(this.funcs[name]){
            const fn=this.funcs[name],fs=new Scope(this.g);
            fn.params.forEach((p,i)=>fs.setL(p,args[i]??null));
            const r=this.blk(fn.body,fs);
            return r instanceof Sig&&r.t==='return'?r.v:null;
        }
        const maybe=sc.get(name);
        if(maybe&&maybe.__anon)return this.invokeAnon(maybe,args);
        const nat=getNatives(this);
        if(nat[name])return nat[name](...args);
        const pts=name.split('.');
        if(pts.length>1){const m=this.mods[pts[0]];if(m&&typeof m[pts[1]]==='function')return m[pts[1]](...args);}
        return null;
    }

    callM(obj,method,argNodes,sc){
        const args=argNodes.map(a=>this.ev(a,sc));
        if(obj==null)return null;
        if(typeof obj==='string'&&this.mods[obj]){const m=this.mods[obj];if(typeof m[method]==='function')return m[method](...args);}
        if(obj&&obj.__methods&&obj.__methods[method]){
    const fn=obj.__methods[method];
    const fs=new Scope(this.g);
    fs.setL('self',obj);
    
    Object.entries(obj.__props||{}).forEach(([k,v])=>fs.setL(k,v));
    
    Object.entries(obj).forEach(([k,v])=>{
        if(k!=='__class'&&k!=='__props'&&k!=='__methods')fs.setL(k,v);
    });
    fn.params.forEach((p,i)=>fs.setL(p,args[i]??null));
    const r=this.blk(fn.body,fs);
    
    Object.keys(fs.v).forEach(k=>{
        if(k!=='self'&&k in obj)obj[k]=fs.v[k];
    });
    return r instanceof Sig&&r.t==='return'?r.v:null;
}
        if(typeof obj[method]==='function')return obj[method](...args);
        return null;
    }

    newInst(cls,argNodes,sc){
        const def=this.classes[cls];
        if(!def)throw new AuraError('RuntimeError',`Classe inconnue : ${cls}`);
        const args=argNodes.map(a=>this.ev(a,sc));
        const inst={__class:cls,__props:{},__methods:{}};
        def.body.forEach(n=>{
            if(n.type==='FuncDecl')inst.__methods[n.name]=n;
            else if(n.type==='VarDecl')inst.__props[n.name]=this.ev(n.value,sc);
        });
        if(def.parent&&this.classes[def.parent]){
            const par=this.classes[def.parent];
            par.body.forEach(n=>{
                if(n.type==='FuncDecl'&&!inst.__methods[n.name])inst.__methods[n.name]=n;
                else if(n.type==='VarDecl'&&!inst.__props[n.name])inst.__props[n.name]=this.ev(n.value,sc);
            });
        }
        const ctor=inst.__methods['init']||inst.__methods['constructor'];
        if(ctor){
            const cs=new Scope(this.g);
            cs.setL('self',inst);
            Object.entries(inst.__props).forEach(([k,v])=>cs.setL(k,v));
            ctor.params.forEach((p,i)=>cs.setL(p,args[i]??null));
            this.blk(ctor.body,cs);
        }
        return inst;
    }

    cast(type,v){
        if(!type||v==null)return v;
        switch(type){case'int':return parseInt(v)||0;case'float':return parseFloat(v)||0;case'string':return String(v);case'bool':return Boolean(v);}
        return v;
    }
}




function getNatives(rt){return{
    upper(s){return String(s??'').toUpperCase();},lower(s){return String(s??'').toLowerCase();},
    length(s){return(s??'').length;},trim(s){return String(s??'').trim();},
    ltrim(s){return String(s??'').trimStart();},rtrim(s){return String(s??'').trimEnd();},
    replace(s,f,r){return String(s??'').split(String(f??'')).join(String(r??''));},
    contains(s,f){return String(s??'').includes(String(f??''));},
    starts(s,f){return String(s??'').startsWith(String(f??''));},
    ends(s,f){return String(s??'').endsWith(String(f??''));},
    substr(s,i,l){return String(s??'').substr(i??0,l);},
    split(s,sep){return String(s??'').split(sep??'');},
    repeat(s,n){return String(s??'').repeat(Math.max(0,parseInt(n)||0));},
    reverse(s){return String(s??'').split('').reverse().join('');},
    ucfirst(s){s=String(s??'');return s.charAt(0).toUpperCase()+s.slice(1);},
    pad(s,l,c){return String(s??'').padStart(parseInt(l)||0,c??'0');},
    number_format(n,d,dec,sep){return Number(n??0).toFixed(d??2).replace('.',dec??'.').replace(/\B(?=(\d{3})+(?!\d))/g,sep??',');},
    is_email(s){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s??''));},
    is_number(v){return!isNaN(parseFloat(v))&&isFinite(v);},
    is_url(s){try{new URL(s);return true;}catch{return false;}},
    slug(s){return String(s??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');},
    truncate(s,n,suf){s=String(s??'');const sf=suf??'...';return s.length<=(n??100)?s:s.substr(0,(n??100)-sf.length)+sf;},
    nl2br(s){return String(s??'').replace(/\n/g,'<br>');},
    strip_tags(s){return String(s??'').replace(/<[^>]*>/g,'');},
    word_count(s){return String(s??'').trim().split(/\s+/).filter(w=>w).length;},
    sprintf(tpl,...args){return String(tpl??'').replace(/@(\d+)/g,(m,i)=>args[parseInt(i)-1]??m);},
    round(n,d){const f=Math.pow(10,d??0);return Math.round((n??0)*f)/f;},
    floor(n){return Math.floor(n??0);},ceil(n){return Math.ceil(n??0);},
    abs(n){return Math.abs(n??0);},rand(mn,mx){return Math.floor(Math.random()*(((mx??100)-(mn??0))+1))+(mn??0);},
    sqrt(n){return Math.sqrt(n??0);},pow(n,e){return Math.pow(n??0,e??2);},pi(){return Math.PI;},
    toInt(v){return parseInt(v)||0;},toFloat(v){return parseFloat(v)||0;},toString(v){return String(v??'');},
    clamp(n,mn,mx){return Math.min(Math.max(n??0,mn??0),mx??100);},
    log(n){return Math.log(n??1);},random(){return Math.random();},
    count(a){return Array.isArray(a)?a.length:String(a??'').length;},
    first(a){return Array.isArray(a)&&a.length?a[0]:null;},
    last(a){return Array.isArray(a)&&a.length?a[a.length-1]:null;},
    sum(a){return Array.isArray(a)?a.reduce((t,v)=>t+(+v||0),0):0;},
    avg(a){return Array.isArray(a)&&a.length?a.reduce((t,v)=>t+(+v||0),0)/a.length:0;},
    min(a){return Array.isArray(a)?Math.min(...a):null;},
    max(a){return Array.isArray(a)?Math.max(...a):null;},
    push(a,v){if(Array.isArray(a))a.push(v);return a;},pop(a){return Array.isArray(a)?a.pop()??null:null;},
    shift(a){return Array.isArray(a)?a.shift()??null:null;},
    unshift(a,v){if(Array.isArray(a))a.unshift(v);return a;},
    join(a,sep){return Array.isArray(a)?a.join(sep??','):'';},
    slice(a,i,e){return Array.isArray(a)?a.slice(i??0,e):[];},
    unique(a){return Array.isArray(a)?[...new Set(a)]:a;},
    sort(a){return Array.isArray(a)?[...a].sort((x,y)=>isNaN(x)||isNaN(y)?String(x).localeCompare(String(y)):x-y):a;},
    reverse_arr(a){return Array.isArray(a)?[...a].reverse():a;},
    in_array(v,a){return Array.isArray(a)?a.includes(v):false;},
    merge(a,b){return[...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[])];},
    filter(a,fn){if(!Array.isArray(a))return[];if(!fn||!fn.__anon)return a;return a.filter(v=>rt.invokeAnon(fn,[v]));},
    map(a,fn){if(!Array.isArray(a))return[];if(!fn||!fn.__anon)return a;return a.map(v=>rt.invokeAnon(fn,[v]));},
    each(a,fn){if(Array.isArray(a)&&fn&&fn.__anon)a.forEach(v=>rt.invokeAnon(fn,[v]));return null;},
    reduce(a,fn,init){if(!Array.isArray(a)||!fn||!fn.__anon)return init??null;return a.reduce((acc,v)=>rt.invokeAnon(fn,[acc,v]),init??0);},
    shuffle(a){if(!Array.isArray(a))return a;const r=[...a];for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]];}return r;},
    chunk(a,n){if(!Array.isArray(a))return[];const r=[];for(let i=0;i<a.length;i+=(n||1))r.push(a.slice(i,i+(n||1)));return r;},
    flatten(a){return Array.isArray(a)?a.flat(Infinity):a;},
    keys(o){return o&&typeof o==='object'?Object.keys(o):[];},
    values(o){return o&&typeof o==='object'?Object.values(o):[];},
    find(a,fn){if(!Array.isArray(a)||!fn||!fn.__anon)return null;return a.find(v=>rt.invokeAnon(fn,[v]))??null;},
    some(a,fn){if(!Array.isArray(a)||!fn||!fn.__anon)return false;return a.some(v=>rt.invokeAnon(fn,[v]));},
    every(a,fn){if(!Array.isArray(a)||!fn||!fn.__anon)return false;return a.every(v=>rt.invokeAnon(fn,[v]));},
    groupBy(a,k){if(!Array.isArray(a))return{};return a.reduce((r,v)=>{const key=v[k]??'other';(r[key]=r[key]||[]).push(v);return r;},{});},
    pluck(a,k){return Array.isArray(a)?a.map(v=>v[k]??null):[];},
    orderBy(a,k,dir){if(!Array.isArray(a))return a;return[...a].sort((x,y)=>{const d=dir==='desc'?-1:1;return x[k]>y[k]?d:x[k]<y[k]?-d:0;});},
    now(){const d=new Date();return d.getFullYear()+'-'+_p2(d.getMonth()+1)+'-'+_p2(d.getDate())+' '+_p2(d.getHours())+':'+_p2(d.getMinutes())+':'+_p2(d.getSeconds());},
    date(){const d=new Date();return d.getFullYear()+'-'+_p2(d.getMonth()+1)+'-'+_p2(d.getDate());},
    time(){const d=new Date();return _p2(d.getHours())+':'+_p2(d.getMinutes())+':'+_p2(d.getSeconds());},
    year(){return new Date().getFullYear();},month(){return _p2(new Date().getMonth()+1);},
    day(){return _p2(new Date().getDate());},hour(){return _p2(new Date().getHours());},
    ago(ts){const s=Math.floor((Date.now()-new Date(ts).getTime())/1000);if(s<60)return s+'s';if(s<3600)return Math.floor(s/60)+'min';if(s<86400)return Math.floor(s/3600)+'h';return Math.floor(s/86400)+'j';},
    timestamp(){return Math.floor(Date.now()/1000);},
    addDays(d,n){const dt=new Date(d);dt.setDate(dt.getDate()+(n||0));return dt.getFullYear()+'-'+_p2(dt.getMonth()+1)+'-'+_p2(dt.getDate());},
    diffDays(d1,d2){return Math.round((new Date(d2)-new Date(d1))/(1000*60*60*24));},
    formatDate(d,fmt){const dt=new Date(d);return(fmt??'DD/MM/YYYY').replace('YYYY',dt.getFullYear()).replace('MM',_p2(dt.getMonth()+1)).replace('DD',_p2(dt.getDate())).replace('HH',_p2(dt.getHours())).replace('mm',_p2(dt.getMinutes()));},
    isToday(d){return new Date(d).toDateString()===new Date().toDateString();},
    isBefore(d1,d2){return new Date(d1)<new Date(d2);},isAfter(d1,d2){return new Date(d1)>new Date(d2);},
    type(v){return v===null?'null':Array.isArray(v)?'array':typeof v;},
    isset(v){return v!==null&&v!==undefined;},
    empty(v){return!v||(Array.isArray(v)&&v.length===0)||(typeof v==='string'&&v.trim()==='');},
    dump(v){return'<pre style="background:#1e1e2e;color:#cdd6f4;padding:10px;border-radius:6px;font-size:13px;text-align:left">'+JSON.stringify(v,null,2)+'</pre>';},
    json(v){return JSON.stringify(v);},parse(s){try{return JSON.parse(s);}catch{return null;}},
    md5(s){let h=0;for(let i=0;i<String(s).length;i++){h=((h<<5)-h)+String(s).charCodeAt(i);h|=0;}return Math.abs(h).toString(16).padStart(8,'0');},
    uuid(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16);});},
    copy(v){return JSON.parse(JSON.stringify(v));},
    base64_encode(s){return btoa(unescape(encodeURIComponent(String(s??''))));},
    base64_decode(s){try{return decodeURIComponent(escape(atob(String(s??''))));}catch{return null;}},
    url_encode(s){return encodeURIComponent(String(s??''));},
    url_decode(s){return decodeURIComponent(String(s??''));},
    hide(sel){document.querySelectorAll(sel).forEach(e=>e.style.display='none');},
    show_el(sel){document.querySelectorAll(sel).forEach(e=>e.style.display='');},
    toggle(sel){document.querySelectorAll(sel).forEach(e=>e.style.display=e.style.display==='none'?'':'none');},
    addClass(sel,cls){document.querySelectorAll(sel).forEach(e=>e.classList.add(cls));},
    removeClass(sel,cls){document.querySelectorAll(sel).forEach(e=>e.classList.remove(cls));},
    toggleClass(sel,cls){document.querySelectorAll(sel).forEach(e=>e.classList.toggle(cls));},
    hasClass(sel,cls){const e=document.querySelector(sel);return e?e.classList.contains(cls):false;},
    attr(sel,a,v){const e=document.querySelector(sel);if(!e)return null;if(v===undefined)return e.getAttribute(a);e.setAttribute(a,v);return null;},
    append(sel,html){document.querySelectorAll(sel).forEach(e=>e.insertAdjacentHTML('beforeend',html));},
    prepend(sel,html){document.querySelectorAll(sel).forEach(e=>e.insertAdjacentHTML('afterbegin',html));},
    html(sel,val){const e=document.querySelector(sel);if(val===undefined)return e?e.innerHTML:null;if(e)e.innerHTML=val;return null;},
    text(sel,val){const e=document.querySelector(sel);if(val===undefined)return e?e.textContent:null;if(e)e.textContent=val;return null;},
    css(sel,prop,val){document.querySelectorAll(sel).forEach(e=>e.style[prop]=val);},
    scroll_to(sel){const e=document.querySelector(sel);if(e)e.scrollIntoView({behavior:'smooth'});},
    focus(sel){const e=document.querySelector(sel);if(e)e.focus();},
    val(sel,v){const e=document.querySelector(sel);if(!e)return null;if(v===undefined)return e.value;e.value=v;return null;},
};}
function _p2(n){return String(n).padStart(2,'0');}




const Session={_p:'aura_s_',set(k,v){localStorage.setItem(this._p+k,JSON.stringify(v));},get(k){try{return JSON.parse(localStorage.getItem(this._p+k));}catch{return null;}},delete(k){localStorage.removeItem(this._p+k);},destroy(){Object.keys(localStorage).filter(k=>k.startsWith(this._p)).forEach(k=>localStorage.removeItem(k));},exists(k){return localStorage.getItem(this._p+k)!==null;},user(){return this.get('user');}};
const Auth={login(u){Session.set('user',u);Session.set('__auth',true);},logout(){Session.delete('user');Session.delete('__auth');window.location.href='/login.aura';},check(){return Session.get('__auth')===true;},user(){return Session.get('user');},guard(r='/login.aura'){if(!this.check())window.location.href=r;}};
const Storage={set(k,v){localStorage.setItem(k,JSON.stringify(v));},get(k){try{return JSON.parse(localStorage.getItem(k));}catch{return null;}},delete(k){localStorage.removeItem(k);},clear(){localStorage.clear();},exists(k){return localStorage.getItem(k)!==null;}};
const Router={go(p){window.location.href=p;},back(){window.history.back();},forward(){window.history.forward();},current(){return window.location.pathname;},params(){const p={};new URLSearchParams(window.location.search).forEach((v,k)=>p[k]=v);return p;}};
const Http={get(url){try{const x=new XMLHttpRequest();x.open('GET',url,false);x.send();return x.status===200?JSON.parse(x.responseText):null;}catch{return null;}},post(url,d){try{const x=new XMLHttpRequest();x.open('POST',url,false);x.setRequestHeader('Content-Type','application/json');x.send(JSON.stringify(d));return x.status===200?JSON.parse(x.responseText):null;}catch{return null;}},put(url,d){try{const x=new XMLHttpRequest();x.open('PUT',url,false);x.setRequestHeader('Content-Type','application/json');x.send(JSON.stringify(d));return x.status===200?JSON.parse(x.responseText):null;}catch{return null;}},delete(url){try{const x=new XMLHttpRequest();x.open('DELETE',url,false);x.send();return x.status===200?JSON.parse(x.responseText):null;}catch{return null;}}};
const Form={get(n){const el=document.querySelector(`[name="${n}"]`);return el?el.value:null;},getAll(){const d={};document.querySelectorAll('[name]').forEach(el=>d[el.name]=el.value);return d;},set(n,v){const el=document.querySelector(`[name="${n}"]`);if(el)el.value=String(v);},clear(s='form'){const f=document.querySelector(s);if(f)f.querySelectorAll('input,textarea,select').forEach(el=>el.value='');},isValid(rules){let ok=true;Object.entries(rules||{}).forEach(([n,r])=>{const v=this.get(n);if(r==='required'&&(!v||!v.trim()))ok=false;if(r==='email'&&v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))ok=false;});return ok;}};


const Validator={
    _e:[],
    required(n,l){const v=Form.get(n);if(!v||!String(v).trim()){this._e.push((l||n)+' est requis');return false;}return true;},
    email(n,l){const v=Form.get(n);if(v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)){this._e.push((l||n)+' invalide');return false;}return true;},
    min(n,mn,l){const v=parseFloat(Form.get(n));if(isNaN(v)||v<mn){this._e.push((l||n)+' >= '+mn+' requis');return false;}return true;},
    max(n,mx,l){const v=parseFloat(Form.get(n));if(isNaN(v)||v>mx){this._e.push((l||n)+' <= '+mx+' requis');return false;}return true;},
    minlen(n,mn,l){const v=Form.get(n)||'';if(v.length<mn){this._e.push((l||n)+' min '+mn+' chars');return false;}return true;},
    maxlen(n,mx,l){const v=Form.get(n)||'';if(v.length>mx){this._e.push((l||n)+' max '+mx+' chars');return false;}return true;},
    regex(n,pat,l){const v=Form.get(n)||'';const r=new RegExp(pat.replace(/^\/|\/[gimsuy]*$/g,''));if(!r.test(v)){this._e.push((l||n)+' format invalide');return false;}return true;},
    phone(n,l){const v=Form.get(n)||'';if(v.trim()!==''&&!/^[+\d\s\-()]{7,15}$/.test(v)){this._e.push((l||n)+' numéro invalide');return false;}return true;},
    errors(){return this._e;},
    hasErrors(){return this._e.length>0;},
    clear(){this._e=[];},
    firstError(){return this._e[0]||null;}
};

const Cookie={set(k,v,days){let exp='';if(days){const d=new Date();d.setTime(d.getTime()+(days*86400000));exp='; expires='+d.toUTCString();}document.cookie=k+'='+encodeURIComponent(JSON.stringify(v))+exp+'; path=/';},get(k){const name=k+'=';for(let c of document.cookie.split(';')){c=c.trim();if(c.startsWith(name))try{return JSON.parse(decodeURIComponent(c.substring(name.length)));}catch{return null;}}return null;},delete(k){document.cookie=k+'=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';},exists(k){return Cookie.get(k)!==null;}};
const DB={_cfg:null,_t:{},connect(cfg){this._cfg=typeof cfg==='string'?{type:'auto',dbname:cfg}:cfg;const n=this._cfg.dbname||'db';const s=localStorage.getItem('aura_db_'+n);if(s)try{this._t=JSON.parse(s);}catch{}console.log(`%c[AuraJS DB] ✅ ${this._cfg.type||'auto'} → ${n}`,'color:#4ade80;font-weight:bold');return this;},_save(){localStorage.setItem('aura_db_'+(this._cfg?.dbname||'db'),JSON.stringify(this._t));},_match(row,cond){if(!cond)return true;if(typeof cond==='object')return Object.entries(cond).every(([k,v])=>String(row[k])===String(v));const[k,...rest]=cond.split('=');return String(row[k.trim()])===String(rest.join('=').trim());},seed(t,rows){this._t[t]=rows.map((r,i)=>({id:i+1,...r}));this._save();return this;},select(t){return[...(this._t[t]||[])];},where(t,c){return this.select(t).filter(r=>this._match(r,c));},queryOne(t,c){return this.select(t).find(r=>this._match(r,c))||null;},count(t){return(this._t[t]||[]).length;},insert(t,data){if(!this._t[t])this._t[t]=[];const id=(this._t[t].at(-1)?.id??0)+1;this._t[t].push({id,...data});this._save();return id;},update(t,data,c){this._t[t]=(this._t[t]||[]).map(r=>this._match(r,c)?{...r,...data}:r);this._save();},delete(t,c){this._t[t]=(this._t[t]||[]).filter(r=>!this._match(r,c));this._save();},truncate(t){this._t[t]=[];this._save();}};




class ComponentSystem{
    constructor(rt){this.rt=rt;this.defs={};this._ids=0;}

    define(name,template,scriptCode=''){
        this.defs[name]={name,template,scriptCode};
    }

    mount(name,container,props={}){
        const def=this.defs[name];
        if(!def)throw new Error(`Composant inconnu : ${name}`);
        const id='aura-comp-'+(++this._ids);
        container.setAttribute('data-aura-comp',id);
        container.setAttribute('data-aura-name',name);
        const sc=new Scope(this.rt.g);
        sc.setL('__compId',id);sc.setL('__compName',name);
        Object.entries(props).forEach(([k,v])=>{
            if(typeof v==='string'&&v.startsWith('@')){sc.setL(k,this.rt.g.get(v.slice(1))??v);}
            else{sc.setL(k,v);}
        });
        let lifecycle={onMount:null,onDestroy:null,onUpdate:null};
        if(def.scriptCode){
            try{
                const tokens=new Lexer(def.scriptCode).tokenize();
                const ast=new Parser(tokens,def.scriptCode).parse();
                ast.body.forEach(node=>{if(node.type==='Lifecycle')lifecycle[node.hook]={body:node.body,sc};});
                const filtered={...ast,body:ast.body.filter(n=>n.type!=='Lifecycle')};
                this.rt.run(filtered);
                Object.keys(this.rt.g.v).forEach(k=>{if(!(k in sc.v))sc.setL(k,this.rt.g.v[k]);});
            }catch(e){console.warn('[Composant script]',e.message);}
        }
        container.innerHTML=this._renderTemplate(def.template,sc,id);
        this._attachEvents(container,sc,id);
        this._registerReactive(container,sc,id);
        if(lifecycle.onMount){try{this.rt.blk(lifecycle.onMount.body,sc);}catch(e){console.warn('[onMount]',e.message);}}
        container.__auraScope=sc;container.__auraDef=def;container.__auraLifecycle=lifecycle;container.__auraId=id;
        return {id,sc,lifecycle};
    }

    _renderTemplate(tpl,sc,id){
        let html=tpl;
        html=html.replace(/\{\{\s*([^{}]+)\s*\}\}/g,(_,expr)=>{
            try{const t=new Lexer(expr.trim()).tokenize();const p=new Parser(t,expr);const v=this.rt.ev(p.expr(),sc);return v!=null?String(v):'';}catch{return '';}
        });
        html=html.replace(/\{\s*(@[\w.]+)\s*\}/g,(_,expr)=>{
            try{const t=new Lexer(expr.trim()).tokenize();const p=new Parser(t,expr);const v=this.rt.ev(p.expr(),sc);return v!=null?String(v):'';}catch{return '';}
        });
        html=html.replace(/(?<![a-zA-Z0-9.])@([a-zA-Z_]\w*)(?:\.([a-zA-Z_]\w*))?/g,(_,n,p)=>{
            const v=sc.get(n)??null;if(p)return v&&v[p]!=null?String(v[p]):'';return v!=null?String(v):'';
        });
        html=html.replace(/<([a-zA-Z][a-zA-Z0-9]*)/g,(m,tag)=>`<${tag} data-aura-inst="${id}"`);
        return html;
    }

    _attachEvents(container,sc,id){
        const events=['click','input','change','submit','keyup','mouseover','mouseout','focus','blur'];
        events.forEach(evt=>{
            const attr='on'+evt.charAt(0).toUpperCase()+evt.slice(1);
            container.querySelectorAll(`[${attr}]`).forEach(el=>{
                const code=el.getAttribute(attr);el.removeAttribute(attr);
                el.addEventListener(evt,e=>{
                    e.preventDefault&&evt==='submit'&&e.preventDefault();
                    try{
                        const tokens=new Lexer(code).tokenize();
                        const ast=new Parser(tokens,code).parse();
                        this.rt.out=[];
                        this.rt.blk(ast.body,new Scope(sc));
                        this._rerender(container);
                    }catch(err){console.error('[Event]',err.message);}
                });
            });
        });
    }

    _registerReactive(container,sc,id){
        container.querySelectorAll('[aura-bind]').forEach(el=>{
            const vn=el.getAttribute('aura-bind');
            const val=sc.get(vn);if(val!=null)el.value=String(val);
            el.addEventListener('input',()=>{
                sc.setL(vn,el.value);this.rt.g.v[vn]=el.value;
                container.querySelectorAll(`[aura-text="${vn}"]`).forEach(t=>t.textContent=el.value);
            });
        });
    }

    _rerender(container){
        const sc=container.__auraScope,def=container.__auraDef;if(!sc||!def)return;
        const id=container.__auraId;
        const inputVals={};
        container.querySelectorAll('input,select,textarea').forEach(el=>{if(el.name||el.id)inputVals[el.name||el.id]=el.value;});
        container.innerHTML=this._renderTemplate(def.template,sc,id);
        this._attachEvents(container,sc,id);this._registerReactive(container,sc,id);
        Object.entries(inputVals).forEach(([k,v])=>{const el=container.querySelector(`[name="${k}"],[id="${k}"]`);if(el)el.value=v;});
        const lc=container.__auraLifecycle;
        if(lc&&lc.onUpdate){try{this.rt.blk(lc.onUpdate.body,sc);}catch(e){}}
    }
}




function processDirectives(rt){
    document.querySelectorAll('[aura-if]').forEach(el=>{
        try{const t=new Lexer(el.getAttribute('aura-if')).tokenize();const a=new Parser(t).parse();el.style.display=(a.body.length&&rt.ev(a.body[0],rt.g))?'':'none';}catch{el.style.display='none';}
    });
    document.querySelectorAll('[aura-show]').forEach(el=>{
        try{const t=new Lexer(el.getAttribute('aura-show')).tokenize();const a=new Parser(t).parse();el.style.display=(a.body.length&&rt.ev(a.body[0],rt.g))?'':'none';}catch{el.style.display='none';}
    });
    


document.querySelectorAll('[aura-for]').forEach(el=>{
    const expr=(el.getAttribute('aura-for')||'').replace(/&#64;/g,'@');
    const m=expr.match(/^@(\w+)\s+in\s+@(\w+)$/);
    if(!m)return;
    const[,itemName,arrName]=m;
    const arr=rt.g.get(arrName);
    if(!Array.isArray(arr))return;

    let tpl='';
    const tplEl=el.querySelector('template');
    if(tplEl){
        tpl=tplEl.innerHTML.trim();
        tplEl.remove();
    } else {
        tpl=el.getAttribute('aura-template')||el.innerHTML.trim();
    }
    if(!tpl)return;

    el.removeAttribute('aura-template');
    el.innerHTML='';

    arr.forEach(item=>{
        let html=tpl;
        if(typeof item==='object'&&item!==null){
            Object.entries(item).forEach(([k,v])=>{
                const val=String(v??'');
                html=html.replace(new RegExp(`\\{\\{\\s*@${itemName}\\.${k}\\s*\\}\\}`,'g'),val);
                html=html.replace(new RegExp(`\\{@${itemName}\\.${k}\\}`,'g'),val);
                html=html.replace(new RegExp(`@${itemName}\\.${k}`,'g'),val);
            });
        } else {
            const val=String(item??'');
            html=html.replace(new RegExp(`\\{\\{\\s*@${itemName}\\s*\\}\\}`,'g'),val);
            html=html.replace(new RegExp(`\\{@${itemName}\\}`,'g'),val);
            html=html.replace(new RegExp(`(?<![\\w.])@${itemName}(?![\\w])`,'g'),val);
        }
        el.insertAdjacentHTML('beforeend',html);
    });
});



    document.querySelectorAll('[aura-text]').forEach(el=>{
        const vn=el.getAttribute('aura-text');const val=rt.g.get(vn);
        if(val!==null&&val!==undefined)el.textContent=String(val);
        rt.registerReactive(vn,el,'text');
    });
    document.querySelectorAll('[aura-html]').forEach(el=>{
        const vn=el.getAttribute('aura-html');const val=rt.g.get(vn);
        if(val!==null&&val!==undefined)el.innerHTML=String(val);
        rt.registerReactive(vn,el,'html');
    });
    document.querySelectorAll('[aura-class]').forEach(el=>{
        try{const t=new Lexer(el.getAttribute('aura-class')).tokenize();const a=new Parser(t).parse();const v=a.body.length?rt.ev(a.body[0],rt.g):null;if(v)el.classList.add(v);}catch{}
    });
    document.querySelectorAll('[aura-style]').forEach(el=>{
        const expr=(el.getAttribute('aura-style')||'').replace(/&#64;/g,'@');
        const idx=expr.indexOf(':');if(idx===-1)return;
        const prop=expr.slice(0,idx).trim();const valExpr=expr.slice(idx+1).trim();
        try{const t=new Lexer(valExpr).tokenize();const p=new Parser(t);const v=p.expr();const r=rt.ev(v,rt.g);if(r!==null)el.style[prop]=String(r);}catch{}
    });
    document.querySelectorAll('[onClick]').forEach(el=>{
        const code=el.getAttribute('onClick');el.removeAttribute('onClick');
        el.addEventListener('click',()=>{
            try{const tokens=new Lexer(code).tokenize();const ast=new Parser(tokens,code).parse();rt.blk(ast.body,rt.g);_updateAllReactive(rt);}
            catch(e){console.error('[onClick]',e.message);}
        });
    });
    document.querySelectorAll('[onInput]').forEach(el=>{
        const code=el.getAttribute('onInput');el.removeAttribute('onInput');
        el.addEventListener('input',()=>{
            try{const tokens=new Lexer(code).tokenize();const ast=new Parser(tokens,code).parse();rt.blk(ast.body,rt.g);_updateAllReactive(rt);}catch(e){}
        });
    });
    document.querySelectorAll('[aura-click]').forEach(el=>{
        const fn=el.getAttribute('aura-click');
        el.addEventListener('click',()=>{if(rt.funcs[fn])rt.call(fn,[],rt.g);});
    });
}

function _updateAllReactive(rt){
    rt._reactiveEls.forEach(({varName,el,attr})=>{
        const val=rt.g.get(varName);
        if(attr==='text')el.textContent=String(val??'');
        else if(attr==='html')el.innerHTML=String(val??'');
        else if(attr==='value')el.value=String(val??'');
    });
}




class Renderer{
    constructor(rt){
        this.rt=rt;this._cache={};
        this.rt.onInc=f=>this.incInOut(f);
        this.comps=new ComponentSystem(rt);
    }

    render(){
        this._registerComponents();
        this._procIncludes();
        document.querySelectorAll('aura').forEach(block=>{
            this.rt.out=[];
            try{this.run(block.textContent);}
            catch(e){
                console.error('[AuraJS]',e);
                const html=e instanceof AuraError?e.html()
                    :`<div style="background:#2a0a0a;border:1px solid #f38ba8;border-radius:8px;padding:10px 14px;color:#f38ba8;font-size:13px">
                        <span style="background:#f38ba8;color:#1e1e2e;border-radius:4px;padding:1px 7px;font-size:11px;font-weight:bold">RuntimeError</span>
                        <span style="margin-left:8px">${String(e.message).replace(/</g,'&lt;')}</span>
                      </div>`;
                this.rt.out.push(html);
            }
            const div=document.createElement('div');div.className='aura-output';
            if(this.rt.out.length>0){div.innerHTML=this.rt.out.join('<br>');block.replaceWith(div);}
            else block.remove();
        });
        document.body.innerHTML=this.interp(document.body.innerHTML);
        processDirectives(this.rt);
        this._mountComponents();
        const evts=[...this.rt._evts];this.rt._evts=[];
        evts.forEach(({evt,sel,body,sc})=>{
            document.querySelectorAll(sel).forEach(el=>{
                el.addEventListener(evt,e=>{
                    e.preventDefault();e.stopPropagation();
                    this.rt.out=[];this.rt.blk(body,new Scope(sc));
                    if(this.rt.out.length>0){
                        let out=document.getElementById('aura-event-output');
                        if(!out){out=document.createElement('div');out.id='aura-event-output';const form=el.closest('form');if(form)form.insertAdjacentElement('afterend',out);else el.insertAdjacentElement('afterend',out);}
                        out.innerHTML=this.rt.out.join('<br>');
                    }
                });
            });
        });
    }

    _registerComponents(){
        document.querySelectorAll('aura\\:define,[is="aura-define"]').forEach(el=>{
            const name=el.getAttribute('name');if(!name)return;
            const scriptEl=el.querySelector('aura-script,script[type="aura"]');
            const scriptCode=scriptEl?scriptEl.textContent:'';
            const template=el.innerHTML
                .replace(/<aura-script[^>]*>[\s\S]*?<\/aura-script>/gi,'')
                .replace(/<script[^>]*type="aura"[^>]*>[\s\S]*?<\/script>/gi,'')
                .trim();
            this.comps.define(name,template,scriptCode);el.remove();
        });
    }

    _mountComponents(){
        Object.keys(this.comps.defs).forEach(name=>{
            [`aura\\:${name}`,`aura-${name}`,`[aura-component="${name}"]`].forEach(sel=>{
                try{
                    document.querySelectorAll(sel).forEach(el=>{
                        const props={};
                        Array.from(el.attributes).forEach(attr=>{if(attr.name!=='aura-component')props[attr.name]=attr.value;});
                        const slots={};
                        el.querySelectorAll('[slot]').forEach(s=>{slots[s.getAttribute('slot')]=s.innerHTML;s.remove();});
                        const defaultSlot=el.innerHTML.trim();
                        const container=document.createElement('div');
                        container.className='aura-component';container.setAttribute('data-component',name);
                        el.replaceWith(container);
                        if(defaultSlot)props['__slot_default']=defaultSlot;
                        Object.entries(slots).forEach(([k,v])=>props[`__slot_${k}`]=v);
                        this.comps.mount(name,container,props);
                    });
                }catch(e){}
            });
        });
    }

    _procIncludes(){
        document.querySelectorAll('aura').forEach(block=>{
            const lines=block.textContent.split('\n');
            const incs=lines.filter(l=>l.trim().match(/^include\s+['"]/));
            const rest=lines.filter(l=>!l.trim().match(/^include\s+['"]/));
            incs.forEach(line=>{
                const m=line.trim().match(/^include\s+['"](.+)['"]/);if(!m)return;
                const html=this._fetch(m[1]);
                if(html){const d=document.createElement('div');d.className='aura-include';d.innerHTML=html;block.parentNode.insertBefore(d,block);}
            });
            block.textContent=rest.join('\n');
        });
    }

    _fetch(file){
        if(this._cache[file])return this._cache[file];
        try{
            const xhr=new XMLHttpRequest();xhr.open('GET',file,false);xhr.send();
            if(xhr.status===200||xhr.status===0){
                let html=xhr.responseText;
                html=html.replace(/<aura>([\s\S]*?)<\/aura>/gi,(_,code)=>{try{this.run(code);}catch(e){console.warn('[include]',e.message);}return '';});
                this._cache[file]=html;return html;
            }
        }catch(e){console.warn(`[AuraJS] include "${file}":`,e.message);}
        return null;
    }

    incInOut(file){const html=this._fetch(file);if(html)this.rt.out.push(html);}

    run(code){
        const lexer=new Lexer(code);const tokens=lexer.tokenize();
        const ast=new Parser(tokens,code).parse();this.rt.run(ast);
    }

    interp(html){
        html=html.replace(/&#64;/g,'@');
        return html.replace(/\{\{\s*([^{}]+)\s*\}\}|\{\s*(@[\w.]+)\s*\}/g,(match,expr1,expr2)=>{
            const expr=(expr1||expr2||'').trim();if(!expr)return match;
            if(!expr.startsWith('@')&&!expr.startsWith('#')&&!/[+\-*\/]/.test(expr)&&!/^\d/.test(expr))return match;
            try{const t=new Lexer(expr).tokenize();const p=new Parser(t,expr);const v=this.rt.ev(p.expr(),this.rt.g);return v!=null?String(v):'';}
            catch{return '';}
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════
const mods={Session,Auth,Storage,Router,Http,Form,Validator,Cookie,DB,Store};
const runtime=new Runtime(mods);
const renderer=new Renderer(runtime);

document.addEventListener('DOMContentLoaded',()=>{
    renderer.render();
    console.log('%c⚡ AuraJS v4.0\n  ✅ Composants  ✅ Réactivité  ✅ Store  ✅ Lifecycle  ✅ Events  ✅ Slots','color:#a78bfa;font-weight:bold;font-size:13px;');
});

global.Aura={runtime,renderer,mods,Lexer,Parser,Runtime,Scope,Store,ComponentSystem};

})(window);
