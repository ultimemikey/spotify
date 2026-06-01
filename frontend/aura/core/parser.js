

const { TokenType } = typeof require !== 'undefined'
    ? require('./lexer.js')
    : { TokenType: window.TokenType };




const Node = {
    Program:          (body)                        => ({ type: 'Program',          body }),
    VarDecl:          (name, value, varType)        => ({ type: 'VarDecl',          name, value, varType }),
    ConstDecl:        (name, value, varType)        => ({ type: 'ConstDecl',        name, value, varType }),
    Assign:           (name, value, op)             => ({ type: 'Assign',           name, value, op }),
    IndexAssign:      (name, index, value)          => ({ type: 'IndexAssign',      name, index, value }),
    IncDec:           (name, op)                    => ({ type: 'IncDec',           name, op }),
    Show:             (value)                       => ({ type: 'Show',             value }),
    Include:          (file)                        => ({ type: 'Include',          file }),
    If:               (cond, then, els)             => ({ type: 'If',               cond, then, els }),
    For:              (init, cond, step, body)      => ({ type: 'For',              init, cond, step, body }),
    Foreach:          (arr, item, body)             => ({ type: 'Foreach',          arr, item, body }),
    While:            (cond, body)                  => ({ type: 'While',            cond, body }),
    FuncDecl:         (name, params, body, mod)     => ({ type: 'FuncDecl',         name, params, body, mod }),
    ClassDecl:        (name, parent, body, mod)     => ({ type: 'ClassDecl',        name, parent, body, mod }),
    NewInstance:      (target, cls, args)           => ({ type: 'NewInstance',      target, cls, args }),
    Return:           (value)                       => ({ type: 'Return',           value }),
    Break:            ()                            => ({ type: 'Break' }),
    TryCatch:         (tryBody, catchBody)          => ({ type: 'TryCatch',         tryBody, catchBody }),
    Call:             (name, args)                  => ({ type: 'Call',             name, args }),
    MethodCall:       (obj, method, args)           => ({ type: 'MethodCall',       obj, method, args }),
    ChainCall:        (obj, method, args, target)   => ({ type: 'ChainCall',        obj, method, args, target }),
    On:               (event, selector, body)       => ({ type: 'On',               event, selector, body }),
    DomSet:           (selector, value)             => ({ type: 'DomSet',           selector, value }),
    DomGet:           (target, selector)            => ({ type: 'DomGet',           target, selector }),

    
    BinOp:            (left, op, right)             => ({ type: 'BinOp',            left, op, right }),
    UnaryOp:          (op, expr)                    => ({ type: 'UnaryOp',          op, expr }),
    Ternary:          (cond, then, els)             => ({ type: 'Ternary',          cond, then, els }),
    Literal:          (value)                       => ({ type: 'Literal',          value }),
    VarRef:           (name)                        => ({ type: 'VarRef',           name }),
    ConstRef:         (name)                        => ({ type: 'ConstRef',         name }),
    MemberAccess:     (obj, prop)                   => ({ type: 'MemberAccess',     obj, prop }),
    IndexAccess:      (obj, index)                  => ({ type: 'IndexAccess',      obj, index }),
    ArrayLiteral:     (elements)                    => ({ type: 'ArrayLiteral',     elements }),
    ObjectLiteral:    (pairs)                       => ({ type: 'ObjectLiteral',    pairs }),
};




class Parser {
    constructor(tokens) {
        this.tokens  = tokens;
        this.pos     = 0;
    }

    
    peek(offset = 0) { return this.tokens[this.pos + offset] || { type: TokenType.EOF, value: null }; }
    advance()        { return this.tokens[this.pos++] || { type: TokenType.EOF, value: null }; }
    isEnd()          { return this.peek().type === TokenType.EOF; }

    check(type)      { return this.peek().type === type; }
    checkVal(val)    { return this.peek().value === val; }

    match(...types) {
        for (const t of types) {
            if (this.check(t)) { this.advance(); return true; }
        }
        return false;
    }

    expect(type, msg) {
        if (!this.check(type)) throw new Error(`[AuraJS Parser] ${msg} — trouvé: "${this.peek().value}" (ligne ${this.peek().line})`);
        return this.advance();
    }

    
    parse() {
        const body = [];
        while (!this.isEnd()) {
            const stmt = this.parseStatement();
            if (stmt) body.push(stmt);
        }
        return Node.Program(body);
    }

    
    parseStatement() {
        const tok = this.peek();

        switch (tok.type) {
            case TokenType.IF:        return this.parseIf();
            case TokenType.FOR:       return this.parseFor();
            case TokenType.FOREACH:   return this.parseForeach();
            case TokenType.WHILE:     return this.parseWhile();
            case TokenType.FUNC:      return this.parseFuncDecl();
            case TokenType.TRY:       return this.parseTryCatch();
            case TokenType.INCLUDE:   return this.parseInclude();
            case TokenType.SHOW:      return this.parseShow();
            case TokenType.RETURN:    return this.parseReturn();
            case TokenType.BREAK:     this.advance(); return Node.Break();
            case TokenType.NEW:       return this.parseNew();

            case TokenType.PUBLIC:
            case TokenType.PRIVATE:
            case TokenType.PROTECTED:
            case TokenType.STATIC:
                return this.parseModified();

            case TokenType.TYPE:      return this.parseTypedDecl();
            case TokenType.VAR:       return this.parseVarStatement();
            case TokenType.CONST:     return this.parseConstDecl();
            case TokenType.IDENT:     return this.parseIdentStatement();

            default:
                this.advance(); 
                return null;
        }
    }

    
    parseBlock() {
        this.expect(TokenType.LBRACE, 'Attendu "{"');
        const body = [];
        while (!this.isEnd() && !this.check(TokenType.RBRACE)) {
            const stmt = this.parseStatement();
            if (stmt) body.push(stmt);
        }
        this.expect(TokenType.RBRACE, 'Attendu "}"');
        return body;
    }

    
    parseTypedDecl() {
        const varType = this.advance().value;
        if (this.check(TokenType.VAR)) {
            const name = this.advance().value;
            this.expect(TokenType.ASSIGN, 'Attendu "="');
            const value = this.parseExpression();
            return Node.VarDecl(name, value, varType);
        }
        if (this.check(TokenType.CONST)) {
            const name = this.advance().value;
            this.expect(TokenType.ASSIGN, 'Attendu "="');
            const value = this.parseExpression();
            return Node.ConstDecl(name, value, varType);
        }
        return null;
    }

    
    parseVarStatement() {
        const name = this.advance().value;

        
        if (this.check(TokenType.INC)) { this.advance(); return Node.IncDec(name, '++'); }
        if (this.check(TokenType.DEC)) { this.advance(); return Node.IncDec(name, '--'); }

        
        if (this.check(TokenType.LBRACKET)) {
            this.advance();
            const index = this.parseExpression();
            this.expect(TokenType.RBRACKET, 'Attendu "]"');
            this.expect(TokenType.ASSIGN, 'Attendu "="');
            const value = this.parseExpression();
            return Node.IndexAssign(name, index, value);
        }

        
        const compOps = {
            [TokenType.PLUSEQ]:  '+=',
            [TokenType.MINUSEQ]: '-=',
            [TokenType.STAREQ]:  '*=',
            [TokenType.SLASHEQ]: '/=',
        };
        if (compOps[this.peek().type]) {
            const op = compOps[this.advance().type];
            const value = this.parseExpression();
            return Node.Assign(name, value, op);
        }

        
        if (this.check(TokenType.ASSIGN)) {
            this.advance();
            const value = this.parseExpression();
            return Node.VarDecl(name, value, null);
        }

        return Node.VarRef(name);
    }

    
    parseConstDecl() {
        const name = this.advance().value;
        this.expect(TokenType.ASSIGN, 'Attendu "="');
        const value = this.parseExpression();
        return Node.ConstDecl(name, value, null);
    }

    
    parseIf() {
        this.advance(); 
        this.expect(TokenType.LPAREN, 'Attendu "("');
        const cond = this.parseExpression();
        this.expect(TokenType.RPAREN, 'Attendu ")"');
        const then = this.parseBlock();

        let els = null;
        if (this.check(TokenType.ELSE)) {
            this.advance();
            if (this.check(TokenType.IF)) {
                els = [this.parseIf()]; 
            } else {
                els = this.parseBlock();
            }
        }

        return Node.If(cond, then, els);
    }

    
    parseFor() {
        this.advance(); 
        this.expect(TokenType.LPAREN, 'Attendu "("');

        
        const varName = this.expect(TokenType.VAR, 'Attendu @variable').value;
        this.expect(TokenType.ASSIGN, 'Attendu "="');
        const initVal = this.parseExpression();
        const init = Node.VarDecl(varName, initVal, 'int');
        this.match(TokenType.SEMICOLON);

        
        const cond = this.parseExpression();
        this.match(TokenType.SEMICOLON);

        
        const stepVarName = this.expect(TokenType.VAR, 'Attendu @variable').value;
        let step;
        if (this.check(TokenType.INC))    { this.advance(); step = Node.IncDec(stepVarName, '++'); }
        else if (this.check(TokenType.DEC)) { this.advance(); step = Node.IncDec(stepVarName, '--'); }
        else if (this.check(TokenType.PLUSEQ))  { this.advance(); step = Node.Assign(stepVarName, this.parseExpression(), '+='); }
        else if (this.check(TokenType.MINUSEQ)) { this.advance(); step = Node.Assign(stepVarName, this.parseExpression(), '-='); }

        this.expect(TokenType.RPAREN, 'Attendu ")"');
        const body = this.parseBlock();
        return Node.For(init, cond, step, body);
    }

    
    parseForeach() {
        this.advance(); 
        this.expect(TokenType.LPAREN, 'Attendu "("');
        const arr = this.expect(TokenType.VAR, 'Attendu @variable').value;
        this.expect(TokenType.AS, 'Attendu "as"');
        this.match(TokenType.VAR); 
        const item = this.check(TokenType.VAR)
            ? this.advance().value
            : (this.pos--, this.advance().value); 
        this.expect(TokenType.RPAREN, 'Attendu ")"');
        const body = this.parseBlock();
        return Node.Foreach(arr, item, body);
    }

    
    parseWhile() {
        this.advance(); 
        this.expect(TokenType.LPAREN, 'Attendu "("');
        const cond = this.parseExpression();
        this.expect(TokenType.RPAREN, 'Attendu ")"');
        const body = this.parseBlock();
        return Node.While(cond, body);
    }

    
    parseFuncDecl(modifier = null) {
        this.advance(); 
        const name = this.expect(TokenType.IDENT, 'Attendu nom de fonction').value;
        this.expect(TokenType.LPAREN, 'Attendu "("');
        const params = this.parseParams();
        this.expect(TokenType.RPAREN, 'Attendu ")"');
        const body = this.parseBlock();
        return Node.FuncDecl(name, params, body, modifier);
    }

    
    parseClassDecl(modifier = null) {
        this.advance(); 
        const name = this.expect(TokenType.IDENT, 'Attendu nom de classe').value;
        let parent = null;
        if (this.check(TokenType.EXTENDS)) {
            this.advance();
            parent = this.expect(TokenType.IDENT, 'Attendu nom de classe parente').value;
        }
        
        if (this.check(TokenType.IDENT) && this.peek().value === 'auth') {
            this.advance();
            this.match(TokenType.LPAREN);
            this.match(TokenType.RPAREN);
        }
        const body = this.parseBlock();
        return Node.ClassDecl(name, parent, body, modifier);
    }

    
    parseModified() {
        const modifier = this.advance().value;
        if (this.check(TokenType.CLASS)) return this.parseClassDecl(modifier);
        if (this.check(TokenType.FUNC))  return this.parseFuncDecl(modifier);
        return null;
    }

    
    parseTryCatch() {
        this.advance(); 
        const tryBody   = this.parseBlock();
        let catchBody = [];
        if (this.check(TokenType.CATCH)) {
            this.advance();
            
            if (this.check(TokenType.LPAREN)) {
                this.advance();
                this.match(TokenType.VAR);
                this.match(TokenType.RPAREN);
            }
            catchBody = this.parseBlock();
        }
        return Node.TryCatch(tryBody, catchBody);
    }

    
    parseInclude() {
        this.advance(); 
        const file = this.expect(TokenType.STRING, 'Attendu chemin du fichier').value;
        return Node.Include(file);
    }

    
    parseShow() {
        this.advance(); 
        this.expect(TokenType.LPAREN, 'Attendu "("');
        const value = this.parseExpression();
        this.expect(TokenType.RPAREN, 'Attendu ")"');
        return Node.Show(value);
    }

    
    parseReturn() {
        this.advance(); 
        const value = this.isEnd() || this.check(TokenType.RBRACE) ? Node.Literal(null) : this.parseExpression();
        return Node.Return(value);
    }

    
    parseNew() {
        this.advance(); 
        const cls = this.expect(TokenType.IDENT, 'Attendu nom de classe').value;
        this.expect(TokenType.LPAREN, 'Attendu "("');
        const args = this.parseArgs();
        this.expect(TokenType.RPAREN, 'Attendu ")"');
        return { type: 'NewExpr', cls, args };
    }

    
    parseIdentStatement() {
        const name = this.peek().value;

        
        if (this.tokens[this.pos + 1]?.type === TokenType.LPAREN) {
            this.advance();
            this.advance(); 
            const args = this.parseArgs();
            this.expect(TokenType.RPAREN, 'Attendu ")"');

            
            if (this.check(TokenType.DOT)) {
                this.advance();
                const method = this.expect(TokenType.IDENT, 'Attendu nom de méthode').value;
                this.expect(TokenType.LPAREN, 'Attendu "("');
                const mArgs = this.parseArgs();
                this.expect(TokenType.RPAREN, 'Attendu ")"');
                return Node.ChainCall(name, method, mArgs, null);
            }

            return Node.Call(name, args);
        }

        
        this.advance();
        return null;
    }

    
    parseParams() {
        const params = [];
        while (!this.check(TokenType.RPAREN) && !this.isEnd()) {
            if (this.check(TokenType.TYPE)) this.advance(); 
            if (this.check(TokenType.VAR)) params.push(this.advance().value);
            if (!this.match(TokenType.COMMA)) break;
        }
        return params;
    }

    
    parseArgs() {
        const args = [];
        while (!this.check(TokenType.RPAREN) && !this.isEnd()) {
            args.push(this.parseExpression());
            if (!this.match(TokenType.COMMA)) break;
        }
        return args;
    }

    
    parseExpression() {
        let expr = this.parseOr();

        
        if (this.check(TokenType.IDENT) && this.peek().value === '?') {
            this.advance();
            const then = this.parseExpression();
            this.expect(TokenType.COLON, 'Attendu ":"');
            const els = this.parseExpression();
            return Node.Ternary(expr, then, els);
        }

        return expr;
    }

    parseOr() {
        let left = this.parseAnd();
        while (this.check(TokenType.OR)) {
            const op = this.advance().value;
            left = Node.BinOp(left, op, this.parseAnd());
        }
        return left;
    }

    parseAnd() {
        let left = this.parseEquality();
        while (this.check(TokenType.AND)) {
            const op = this.advance().value;
            left = Node.BinOp(left, op, this.parseEquality());
        }
        return left;
    }

    parseEquality() {
        let left = this.parseComparison();
        while (this.check(TokenType.EQ) || this.check(TokenType.NEQ)) {
            const op = this.advance().value;
            left = Node.BinOp(left, op, this.parseComparison());
        }
        return left;
    }

    parseComparison() {
        let left = this.parseAddSub();
        while ([TokenType.LT, TokenType.GT, TokenType.LTE, TokenType.GTE].includes(this.peek().type)) {
            const op = this.advance().value;
            left = Node.BinOp(left, op, this.parseAddSub());
        }
        return left;
    }

    parseAddSub() {
        let left = this.parseMulDiv();
        while (this.check(TokenType.PLUS) || this.check(TokenType.MINUS)) {
            const op = this.advance().value;
            left = Node.BinOp(left, op, this.parseMulDiv());
        }
        return left;
    }

    parseMulDiv() {
        let left = this.parseUnary();
        while (this.check(TokenType.STAR) || this.check(TokenType.SLASH) || this.check(TokenType.PERCENT)) {
            const op = this.advance().value;
            left = Node.BinOp(left, op, this.parseUnary());
        }
        return left;
    }

    parseUnary() {
        if (this.check(TokenType.NOT)) {
            const op = this.advance().value;
            return Node.UnaryOp(op, this.parseUnary());
        }
        if (this.check(TokenType.MINUS)) {
            const op = this.advance().value;
            return Node.UnaryOp('-', this.parseUnary());
        }
        return this.parsePostfix();
    }

    parsePostfix() {
        let expr = this.parsePrimary();

        while (true) {
            
            if (this.check(TokenType.DOT)) {
                this.advance();
                const prop = this.expect(TokenType.IDENT, 'Attendu propriété').value;
                if (this.check(TokenType.LPAREN)) {
                    this.advance();
                    const args = this.parseArgs();
                    this.expect(TokenType.RPAREN, 'Attendu ")"');
                    expr = Node.MethodCall(expr, prop, args);
                } else {
                    expr = Node.MemberAccess(expr, prop);
                }
                continue;
            }
            
            if (this.check(TokenType.LBRACKET)) {
                this.advance();
                const index = this.parseExpression();
                this.expect(TokenType.RBRACKET, 'Attendu "]"');
                expr = Node.IndexAccess(expr, index);
                continue;
            }
            break;
        }

        return expr;
    }

    parsePrimary() {
        const tok = this.peek();

        
        if (tok.type === TokenType.NUMBER) { this.advance(); return Node.Literal(tok.value); }
        if (tok.type === TokenType.STRING) { this.advance(); return Node.Literal(tok.value); }
        if (tok.type === TokenType.BOOL)   { this.advance(); return Node.Literal(tok.value); }
        if (tok.type === TokenType.NULL)   { this.advance(); return Node.Literal(null); }

        
        if (tok.type === TokenType.VAR) { this.advance(); return Node.VarRef(tok.value); }

        
        if (tok.type === TokenType.CONST) { this.advance(); return Node.ConstRef(tok.value); }

        
        if (tok.type === TokenType.LBRACKET) {
            this.advance();
            const elements = [];
            while (!this.check(TokenType.RBRACKET) && !this.isEnd()) {
                elements.push(this.parseExpression());
                if (!this.match(TokenType.COMMA)) break;
            }
            this.expect(TokenType.RBRACKET, 'Attendu "]"');
            return Node.ArrayLiteral(elements);
        }

        
        if (tok.type === TokenType.LBRACE) {
            this.advance();
            const pairs = [];
            while (!this.check(TokenType.RBRACE) && !this.isEnd()) {
                const key = this.advance().value;
                this.match(TokenType.ASSIGN) || this.match(TokenType.COLON);
                const val = this.parseExpression();
                pairs.push({ key, val });
                if (!this.match(TokenType.COMMA)) break;
            }
            this.expect(TokenType.RBRACE, 'Attendu "}"');
            return Node.ObjectLiteral(pairs);
        }

        
        if (tok.type === TokenType.LPAREN) {
            this.advance();
            const expr = this.parseExpression();
            this.expect(TokenType.RPAREN, 'Attendu ")"');
            return expr;
        }

        
        if (tok.type === TokenType.IDENT) {
            this.advance();
            if (this.check(TokenType.LPAREN)) {
                this.advance();
                const args = this.parseArgs();
                this.expect(TokenType.RPAREN, 'Attendu ")"');
                return Node.Call(tok.value, args);
            }
            return Node.Literal(tok.value);
        }

        
        if (tok.type === TokenType.NEW) {
            return this.parseNew();
        }

        this.advance();
        return Node.Literal(null);
    }
}

if (typeof module !== 'undefined') module.exports = { Parser, Node };
