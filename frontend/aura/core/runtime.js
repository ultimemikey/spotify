

class Signal {
    constructor(type, value) { this.type = type; this.value = value; }
}
const RETURN = (v) => new Signal('return', v);
const BREAK  = ()  => new Signal('break',  null);

class Scope {
    constructor(parent = null) {
        this.vars   = {};
        this.parent = parent;
    }

    get(name) {
        if (name in this.vars) return this.vars[name];
        if (this.parent)       return this.parent.get(name);
        return undefined;
    }

    set(name, value) {
        if (name in this.vars) { this.vars[name] = value; return; }
        if (this.parent && this.parent.has(name)) { this.parent.set(name, value); return; }
        this.vars[name] = value;
    }

    setLocal(name, value) { this.vars[name] = value; }
    has(name) { return name in this.vars || (this.parent?.has(name) ?? false); }
}

class Runtime {
    constructor(modules = {}) {
        this.global  = new Scope();
        this.consts  = {};
        this.funcs   = {};
        this.classes = {};
        this.output  = [];
        this.modules = modules;

        
        Object.entries(modules).forEach(([k, v]) => this.global.setLocal(k, v));
    }

    
    exec(node, scope = this.global) {
        if (!node) return null;

        switch (node.type) {

            case 'PropAssign': {
    
    const target = scope.get(node.obj);
    if (target && typeof target === 'object') {
        target[node.prop] = this.eval(node.value, scope);
        
        if (target.__props) target.__props[node.prop] = target[node.prop];
    }
    return null;
}
            

            case 'Program':
                return this.execBlock(node.body, scope);

            
            case 'VarDecl': {
                const val = this.eval(node.value, scope);
                const casted = this.cast(node.varType, val);
                scope.setLocal(node.name, casted);
                this.global.vars[node.name] = casted; 
                return null;
            }

            case 'ConstDecl': {
                const val = this.cast(node.varType, this.eval(node.value, scope));
                this.consts[node.name] = val;
                return null;
            }

            case 'Assign': {
                let cur = scope.get(node.name) ?? 0;
                const rhs = this.eval(node.value, scope);
                switch (node.op) {
                    case '+=': cur = typeof cur === 'string' ? cur + String(rhs) : cur + rhs; break;
                    case '-=': cur -= rhs; break;
                    case '*=': cur *= rhs; break;
                    case '/=': cur = rhs !== 0 ? cur / rhs : 0; break;
                    default:   cur = rhs;
                }
                scope.set(node.name, cur);
                return null;
            }

            case 'IndexAssign': {
                const arr = scope.get(node.name);
                if (Array.isArray(arr)) {
                    arr[this.eval(node.index, scope)] = this.eval(node.value, scope);
                    scope.set(node.name, arr);
                }
                return null;
            }

            case 'IncDec': {
                let cur = scope.get(node.name) ?? 0;
                scope.set(node.name, node.op === '++' ? cur + 1 : cur - 1);
                return null;
            }

            
            case 'Show': {
                const val = this.eval(node.value, scope);
                this.output.push(val != null ? String(val) : '');
                return null;
            }

            
            case 'Include':
                this.handleInclude(node.file);
                return null;

            
            case 'If': {
                const cond = this.eval(node.cond, scope);
                if (cond) {
                    return this.execBlock(node.then, new Scope(scope));
                } else if (node.els) {
                    return this.execBlock(node.els, new Scope(scope));
                }
                return null;
            }

            
            case 'For': {
                const forScope = new Scope(scope);
                this.exec(node.init, forScope);
                let maxIter = 1_000_000;
                while (maxIter-- > 0) {
                    const cond = this.eval(node.cond, forScope);
                    if (!cond) break;
                    const result = this.execBlock(node.body, new Scope(forScope));
                    if (result instanceof Signal) {
                        if (result.type === 'break')  break;
                        if (result.type === 'return') return result;
                    }
                    this.exec(node.step, forScope);
                }
                return null;
            }

            
            case 'Foreach': {
                const arr = scope.get(node.arr) ?? [];
                if (!Array.isArray(arr)) return null;
                for (const item of arr) {
                    const loopScope = new Scope(scope);
                    loopScope.setLocal(node.item, item);
                    const result = this.execBlock(node.body, loopScope);
                    if (result instanceof Signal) {
                        if (result.type === 'break')  break;
                        if (result.type === 'return') return result;
                    }
                }
                return null;
            }

            
            case 'While': {
                let maxIter = 1_000_000;
                while (maxIter-- > 0 && this.eval(node.cond, scope)) {
                    const result = this.execBlock(node.body, new Scope(scope));
                    if (result instanceof Signal) {
                        if (result.type === 'break')  break;
                        if (result.type === 'return') return result;
                    }
                }
                return null;
            }

            
            case 'FuncDecl':
                this.funcs[node.name] = node;
                return null;

            
            case 'ClassDecl':
                this.classes[node.name] = node;
                this.parseClassBody(node);
                return null;

            
            case 'Return':
                return RETURN(this.eval(node.value, scope));

            
            case 'Break':
                return BREAK();

            
            case 'TryCatch': {
                try {
                    this.execBlock(node.tryBody, new Scope(scope));
                } catch (e) {
                    const catchScope = new Scope(scope);
                    catchScope.setLocal('__error', e.message);
                    this.execBlock(node.catchBody, catchScope);
                }
                return null;
            }

            
            case 'Call':
                return this.callFunc(node.name, node.args, scope);

            
            case 'MethodCall': {
                const obj = this.eval(node.obj, scope);
                return this.callMethod(obj, node.method, node.args, scope);
            }

            
            case 'DomSet': {
                const el = document.querySelector(this.eval(node.selector, scope));
                if (el) el.innerHTML = String(this.eval(node.value, scope));
                return null;
            }

            
            case 'DomGet': {
                const el = document.querySelector(this.eval(node.selector, scope));
                const val = el ? (el.value ?? el.innerHTML) : null;
                scope.setLocal(node.target, val);
                return null;
            }

            
            case 'On': {
                const evtType  = this.eval(node.event, scope);
                const selector = this.eval(node.selector, scope);
                const body     = node.body;
                const captured = scope;
                document.querySelectorAll(selector).forEach(el => {
                    el.addEventListener(evtType, (e) => {
                        const evtScope = new Scope(captured);
                        evtScope.setLocal('__event', e);
                        this.execBlock(body, evtScope);
                    });
                });
                return null;
            }

            default:
                return null;
        }
    }

    
    execBlock(nodes, scope) {
        for (const node of nodes) {
            const result = this.exec(node, scope);
            if (result instanceof Signal) return result;
        }
        return null;
    }

    
    eval(node, scope = this.global) {
        if (!node) return null;

        switch (node.type) {
            case 'Literal':       return node.value;
            case 'VarRef':        return scope.get(node.name) ?? null;
            case 'ConstRef':      return this.consts[node.name] ?? null;

            case 'ArrayLiteral':
                return node.elements.map(e => this.eval(e, scope));

            case 'ObjectLiteral': {
                const obj = {};
                node.pairs.forEach(({ key, val }) => obj[key] = this.eval(val, scope));
                return obj;
            }

            case 'MemberAccess': {
                const obj = this.eval(node.obj, scope);
                if (obj == null) return null;
                return obj[node.prop] ?? null;
            }

            case 'IndexAccess': {
                const obj = this.eval(node.obj, scope);
                const idx = this.eval(node.index, scope);
                return Array.isArray(obj) ? obj[idx] : obj?.[idx] ?? null;
            }

            case 'BinOp': {
                const L = this.eval(node.left,  scope);
                const R = this.eval(node.right, scope);
                switch (node.op) {
                    case '+':  return typeof L === 'string' || typeof R === 'string' ? String(L ?? '') + String(R ?? '') : L + R;
                    case '-':  return L - R;
                    case '*':  return L * R;
                    case '/':  return R !== 0 ? L / R : null;
                    case '%':  return L % R;
                    case '==': return L == R;
                    case '!=': return L != R;
                    case '<':  return L < R;
                    case '>':  return L > R;
                    case '<=': return L <= R;
                    case '>=': return L >= R;
                    case '&&': return L && R;
                    case '||': return L || R;
                }
                return null;
            }

            case 'UnaryOp': {
                const v = this.eval(node.expr, scope);
                if (node.op === '!')  return !v;
                if (node.op === '-')  return -v;
                return v;
            }

            case 'Ternary':
                return this.eval(node.cond, scope) ? this.eval(node.then, scope) : this.eval(node.els, scope);

            case 'Call':
                return this.callFunc(node.name, node.args, scope);

            case 'MethodCall': {
                const obj = this.eval(node.obj, scope);
                return this.callMethod(obj, node.method, node.args, scope);
            }

            case 'NewExpr': {
                return this.instantiateClass(node.cls, node.args, scope);
            }

            default:
                return null;
        }
    }

    
    callFunc(name, argNodes, scope) {
        const args = argNodes.map(a => this.eval(a, scope));

        
        if (this.funcs[name]) {
            const fn = this.funcs[name];
            const fnScope = new Scope(this.global);
            fn.params.forEach((p, i) => fnScope.setLocal(p, args[i]));
            const result = this.execBlock(fn.body, fnScope);
            return result instanceof Signal && result.type === 'return' ? result.value : null;
        }

        
        const parts = name.split('.');
        if (parts.length > 1) {
            const mod = this.modules[parts[0]];
            if (mod && typeof mod[parts[1]] === 'function') {
                return mod[parts[1]](...args);
            }
        }

        return null;
    }

    
    callMethod(obj, method, argNodes, scope) {
    const args = argNodes.map(a => this.eval(a, scope));
    if (obj == null) return null;
    if (typeof obj[method] === 'function') return obj[method](...args);

    if (obj.__methods?.[method]) {
        const fn = obj.__methods[method];
        const fnScope = new Scope(this.global);
        fnScope.setLocal('self', obj);
        Object.entries(obj.__props || {}).forEach(([k, v]) => fnScope.setLocal(k, v));
        fn.params.forEach((p, i) => fnScope.setLocal(p, args[i]));
        const result = this.execBlock(fn.body, fnScope);
        
        Object.keys(obj.__props || {}).forEach(k => {
            if (fnScope.vars[k] !== undefined) obj[k] = fnScope.vars[k];
        });
        return result instanceof Signal && result.type === 'return' ? result.value : null;
    }

    if (method === 'length') return obj?.length ?? 0;
    return null;
}

    
    instantiateClass(className, argNodes, scope) {
        const cls = this.classes[className];
        if (!cls) throw new Error(`[AuraJS] Classe inconnue: ${className}`);
        const args = argNodes.map(a => this.eval(a, scope));
        const instance = { __class: className, __props: {}, __methods: {} };

        cls.body.forEach(node => {
            if (node.type === 'FuncDecl') {
                instance.__methods[node.name] = node;
            } else if (node.type === 'VarDecl') {
                instance.__props[node.name] = this.eval(node.value, scope);
            }
        });

        
        
if (instance.__methods['init'] || instance.__methods['constructor']) {
    const ctor = instance.__methods['init'] || instance.__methods['constructor'];
    const ctorScope = new Scope(this.global);
    ctorScope.setLocal('self', instance);
    ctor.params.forEach((p, i) => ctorScope.setLocal(p, args[i]));
    this.execBlock(ctor.body, ctorScope);
    
    Object.entries(ctorScope.vars).forEach(([k, v]) => {
        if (k !== 'self') {
            instance[k] = v;
            instance.__props[k] = v;
        }
    });
}

        return instance;
    }

    
    parseClassBody(node) {
        node.__parsedMethods = {};
        node.__parsedProps   = {};
        node.body.forEach(n => {
            if (n.type === 'FuncDecl') node.__parsedMethods[n.name] = n;
            if (n.type === 'VarDecl')  node.__parsedProps[n.name]   = n.value;
        });
    }

    
    handleInclude(file) {
        
        if (this.onInclude) this.onInclude(file);
    }

    
    cast(type, value) {
        if (!type || value == null) return value;
        switch (type) {
            case 'int':    return parseInt(value)   || 0;
            case 'float':  return parseFloat(value) || 0.0;
            case 'string': return String(value);
            case 'bool':   return Boolean(value);
            default:       return value;
        }
    }
}

if (typeof module !== 'undefined') module.exports = { Runtime, Scope, Signal };












const Errors = typeof require !== 'undefined' ? require('./errorEngine.js') : window.AuraErrors;

function runAST(ast) {
    try {
        
        executeNode(ast);
    } catch (err) {
        Errors.push(err, { file: ast.file || null, line: ast.line || null });
    }
}


function includeFile(path) {
    const fs = require('fs');
    try {
        if (!fs.existsSync(path)) throw new Error(`Fichier introuvable : ${path}`);
        if (fs.lstatSync(path).isDirectory()) throw new Error(`C'est un dossier, pas un fichier : ${path}`);
        const content = fs.readFileSync(path, 'utf8');
        return content;
    } catch (err) {
        Errors.push(err, { file: path });
        return '';
    }
}
