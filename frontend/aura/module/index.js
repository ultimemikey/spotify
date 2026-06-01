




const Session = {
    _prefix: 'aura_sess_',
    set(key, val)  { localStorage.setItem(this._prefix + key, JSON.stringify(val)); },
    get(key)       { try { return JSON.parse(localStorage.getItem(this._prefix + key)); } catch { return null; } },
    delete(key)    { localStorage.removeItem(this._prefix + key); },
    destroy()      { Object.keys(localStorage).filter(k => k.startsWith(this._prefix)).forEach(k => localStorage.removeItem(k)); },
    exists(key)    { return localStorage.getItem(this._prefix + key) !== null; },
    user()         { return this.get('user'); },
    all()          {
        const result = {};
        Object.keys(localStorage).filter(k => k.startsWith(this._prefix)).forEach(k => {
            result[k.replace(this._prefix, '')] = this.get(k.replace(this._prefix, ''));
        });
        return result;
    },
};




const Auth = {
    login(user)                  { Session.set('user', user); Session.set('__auth', true); },
    logout()                     { Session.delete('user'); Session.delete('__auth'); Router.go('/login'); },
    check()                      { return Session.exists('__auth') && Session.get('__auth') === true; },
    user()                       { return Session.get('user'); },
    guard(redirect = '/login')   { if (!this.check()) Router.go(redirect); },
    id()                         { return Session.get('user')?.id ?? null; },
};




const Storage = {
    set(key, val)  { localStorage.setItem(key, JSON.stringify(val)); },
    get(key)       { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    delete(key)    { localStorage.removeItem(key); },
    clear()        { localStorage.clear(); },
    exists(key)    { return localStorage.getItem(key) !== null; },
    keys()         { return Object.keys(localStorage); },
};




const Router = {
    _routes: {},
    go(path)             { window.location.href = path; },
    back()               { window.history.back(); },
    forward()            { window.history.forward(); },
    current()            { return window.location.pathname; },
    params()             {
        const params = {};
        new URLSearchParams(window.location.search).forEach((v, k) => params[k] = v);
        return params;
    },
    on(path, file)       { this._routes[path] = file; },
    notFound(file)       { this._routes['404'] = file; },
    resolve()            {
        const path = this.current();
        if (this._routes[path]) return this._routes[path];
        if (this._routes['404']) return this._routes['404'];
        return null;
    },
};




const Http = {
    async get(url, cb) {
        try {
            const r = await fetch(url);
            const d = await r.json();
            if (cb) cb(d);
            return d;
        } catch (e) { console.error('[AuraJS Http]', e); return null; }
    },
    async post(url, data, cb) {
        try {
            const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const d = await r.json();
            if (cb) cb(d);
            return d;
        } catch (e) { console.error('[AuraJS Http]', e); return null; }
    },
    async put(url, data, cb) {
        try {
            const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const d = await r.json();
            if (cb) cb(d);
            return d;
        } catch (e) { console.error('[AuraJS Http]', e); return null; }
    },
    async delete(url, cb) {
        try {
            const r = await fetch(url, { method: 'DELETE' });
            const d = await r.json();
            if (cb) cb(d);
            return d;
        } catch (e) { console.error('[AuraJS Http]', e); return null; }
    },
};




const Form = {
    get(name)          { const el = document.querySelector(`[name="${name}"]`); return el?.value ?? null; },
    getAll()           {
        const data = {};
        document.querySelectorAll('[name]').forEach(el => { data[el.name] = el.value; });
        return data;
    },
    set(name, val)     { const el = document.querySelector(`[name="${name}"]`); if (el) el.value = val; },
    clear(selector)    { document.querySelectorAll(`${selector || 'form'} input, ${selector || 'form'} textarea`).forEach(el => el.value = ''); },
    isValid(rules = {}) {
        let valid = true;
        Object.entries(rules).forEach(([name, rule]) => {
            const val = this.get(name);
            if (rule === 'required' && (!val || val.trim() === '')) valid = false;
            if (rule === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) valid = false;
            if (rule === 'int' && val && isNaN(parseInt(val))) valid = false;
        });
        return valid;
    },
    errors()           { return []; },
};




const DB = {
    _config: null,
    _tables: {},
    _connected: false,

    connect(config) {
        this._config    = typeof config === 'string' ? { type: 'auto', dbname: config } : config;
        this._connected = true;
        const type      = this._config.type || 'auto';
        const name      = this._config.dbname || this._config.file || '?';
        console.log(`%c[AuraJS DB] ✅ Connecté → ${type} : ${name}`, 'color:#4ade80;font-weight:bold');

        
        const saved = localStorage.getItem('aura_db_' + name);
        if (saved) { try { this._tables = JSON.parse(saved); } catch {} }

        return this;
    },

    
    _persist() {
        const name = this._config?.dbname || this._config?.file || 'default';
        localStorage.setItem('aura_db_' + name, JSON.stringify(this._tables));
    },

    
    seed(table, rows) {
        this._tables[table] = rows.map((r, i) => ({ id: i + 1, ...r }));
        this._persist();
        return this;
    },

    
    select(table)            { return [...(this._tables[table] || [])]; },
    where(table, cond)       { return this.select(table).filter(r => this._match(r, cond)); },
    queryOne(table, cond)    { return this.select(table).find(r => this._match(r, cond)) || null; },
    first(table)             { return this.select(table)[0] || null; },
    count(table)             { return (this._tables[table] || []).length; },

    
    insert(table, data) {
        if (!this._tables[table]) this._tables[table] = [];
        const id = (this._tables[table].at(-1)?.id ?? 0) + 1;
        const row = { id, ...data, createdAt: new Date().toISOString() };
        this._tables[table].push(row);
        this._persist();
        return id;
    },

    
    update(table, data, cond) {
        this._tables[table] = (this._tables[table] || []).map(r =>
            this._match(r, cond) ? { ...r, ...data, updatedAt: new Date().toISOString() } : r
        );
        this._persist();
    },

    
    delete(table, cond) {
        this._tables[table] = (this._tables[table] || []).filter(r => !this._match(r, cond));
        this._persist();
    },

    
    truncate(table) { this._tables[table] = []; this._persist(); },

    
    _match(row, cond) {
        if (!cond)              return true;
        if (typeof cond === 'object') return Object.entries(cond).every(([k, v]) => String(row[k]) === String(v));
        const [k, v] = cond.split('=').map(s => s.trim());
        return String(row[k]) === String(v);
    },
};

if (typeof module !== 'undefined') {
    module.exports = { Session, Auth, Storage, Router, Http, Form, DB };
}