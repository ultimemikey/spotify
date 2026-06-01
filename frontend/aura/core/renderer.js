

class Renderer {
    constructor(runtime, lexer, parser) {
        this.runtime = runtime;
        this.Lexer   = lexer;
        this.Parser  = parser;

        
        this.runtime.onInclude = (file) => this.handleInclude(file);
        this._includeCache = {};
    }

    
    render() {
        
        document.body.innerHTML = this.interpolate(document.body.innerHTML);

        
        document.querySelectorAll('aura').forEach(block => {
            this.runtime.output = [];
            try {
                this.run(block.textContent);
            } catch (e) {
                console.error(e);
                this.runtime.output.push(`<span style="color:#f87171;font-family:monospace">[AuraJS Error] ${e.message}</span>`);
            }

            const out = document.createElement('div');
            out.className = 'aura-output';
            if (this.runtime.output.length > 0) {
                out.innerHTML = this.runtime.output.join('<br>');
                block.replaceWith(out);
            } else {
                block.remove();
            }
        });

        
        document.body.innerHTML = this.interpolate(document.body.innerHTML);
    }

    
    run(code) {
        const tokens = new this.Lexer(code).tokenize();
        const ast    = new this.Parser(tokens).parse();
        this.runtime.exec(ast);
    }

    
    interpolate(html) {
        return html.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, expr) => {
            try {
                const tokens = new this.Lexer(expr.trim()).tokenize();
                const ast    = new this.Parser(tokens).parse();
                if (ast.body.length === 0) return '';
                const val    = this.runtime.eval(ast.body[0], this.runtime.global);
                return val != null ? String(val) : '';
            } catch {
                return '';
            }
        });
    }

    
    handleInclude(file) {
        if (this._includeCache[file]) {
            this.run(this._includeCache[file]);
            return;
        }
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', file, false);
            xhr.send();
            if (xhr.status === 200 || xhr.status === 0) {
                let content = xhr.responseText;
                
                const match = content.match(/<aura>([\s\S]*?)<\/aura>/i);
                const code  = match ? match[1] : content;
                this._includeCache[file] = code;
                this.run(code);
            } else {
                console.warn(`[AuraJS Renderer] include: fichier introuvable → ${file}`);
            }
        } catch (e) {
            console.warn(`[AuraJS Renderer] include erreur → ${file}:`, e.message);
        }
    }
}

if (typeof module !== 'undefined') module.exports = { Renderer };
