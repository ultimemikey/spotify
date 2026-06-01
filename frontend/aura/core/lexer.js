

const TokenType = {
    
    NUMBER:     'NUMBER',
    STRING:     'STRING',
    BOOL:       'BOOL',
    NULL:       'NULL',

    
    VAR:        'VAR',        
    CONST:      'CONST',      
    IDENT:      'IDENT',      

    
    TYPE:       'TYPE',       

    
    IF:         'IF',
    ELSE:       'ELSE',
    FOR:        'FOR',
    FOREACH:    'FOREACH',
    WHILE:      'WHILE',
    FUNC:       'FUNC',
    CLASS:      'CLASS',
    NEW:        'NEW',
    RETURN:     'RETURN',
    BREAK:      'BREAK',
    INCLUDE:    'INCLUDE',
    SHOW:       'SHOW',
    TRY:        'TRY',
    CATCH:      'CATCH',
    AS:         'AS',
    EXTENDS:    'EXTENDS',

    
    PUBLIC:     'PUBLIC',
    PRIVATE:    'PRIVATE',
    PROTECTED:  'PROTECTED',
    STATIC:     'STATIC',

    
    ASSIGN:     'ASSIGN',     
    PLUS:       'PLUS',       
    MINUS:      'MINUS',      
    STAR:       'STAR',       
    SLASH:      'SLASH',      
    PERCENT:    'PERCENT',    
    PLUSEQ:     'PLUSEQ',     
    MINUSEQ:    'MINUSEQ',    
    STAREQ:     'STAREQ',     
    SLASHEQ:    'SLASHEQ',    
    INC:        'INC',        
    DEC:        'DEC',        

    
    EQ:         'EQ',         
    NEQ:        'NEQ',        
    LT:         'LT',         
    GT:         'GT',         
    LTE:        'LTE',        
    GTE:        'GTE',        

    
    AND:        'AND',        
    OR:         'OR',         
    NOT:        'NOT',        

    
    LPAREN:     'LPAREN',     
    RPAREN:     'RPAREN',     
    LBRACE:     'LBRACE',     
    RBRACE:     'RBRACE',     
    LBRACKET:   'LBRACKET',   
    RBRACKET:   'RBRACKET',   
    COMMA:      'COMMA',      
    DOT:        'DOT',        
    SEMICOLON:  'SEMICOLON',  
    COLON:      'COLON',      

    
    EOF:        'EOF',
    NEWLINE:    'NEWLINE',
};

const KEYWORDS = {
    'if':        TokenType.IF,
    'else':      TokenType.ELSE,
    'for':       TokenType.FOR,
    'foreach':   TokenType.FOREACH,
    'while':     TokenType.WHILE,
    'func':      TokenType.FUNC,
    'class':     TokenType.CLASS,
    'new':       TokenType.NEW,
    'return':    TokenType.RETURN,
    'break':     TokenType.BREAK,
    'include':   TokenType.INCLUDE,
    'show':      TokenType.SHOW,
    'try':       TokenType.TRY,
    'catch':     TokenType.CATCH,
    'as':        TokenType.AS,
    'extends':   TokenType.EXTENDS,
    'public':    TokenType.PUBLIC,
    'private':   TokenType.PRIVATE,
    'protected': TokenType.PROTECTED,
    'static':    TokenType.STATIC,
    'true':      TokenType.BOOL,
    'false':     TokenType.BOOL,
    'null':      TokenType.NULL,
    'int':       TokenType.TYPE,
    'float':     TokenType.TYPE,
    'string':    TokenType.TYPE,
    'bool':      TokenType.TYPE,
};

class Token {
    constructor(type, value, line) {
        this.type  = type;
        this.value = value;
        this.line  = line;
    }

    toString() {
        return `Token(${this.type}, ${JSON.stringify(this.value)}, line:${this.line})`;
    }
}

class Lexer {
    constructor(source) {
        this.source  = source;
        this.tokens  = [];
        this.pos     = 0;
        this.line    = 1;
    }

    
    peek(offset = 0) { return this.source[this.pos + offset] || ''; }
    advance()        { const ch = this.source[this.pos++]; if (ch === '\n') this.line++; return ch; }
    isEnd()          { return this.pos >= this.source.length; }

    
    add(type, value) { this.tokens.push(new Token(type, value, this.line)); }

    
    tokenize() {
        while (!this.isEnd()) {
            this.skipWhitespaceAndComments();
            if (this.isEnd()) break;

            const ch = this.peek();

            
            if (ch === '\n') { this.advance(); continue; }

            
            if (this.isDigit(ch)) { this.readNumber(); continue; }

            
            if (ch === '"' || ch === "'" || ch === '`') { this.readString(ch); continue; }

            
            if (ch === '@') { this.advance(); this.readVar(); continue; }

            
            if (ch === '#') { this.advance(); this.readConst(); continue; }

            
            if (this.isAlpha(ch)) { this.readIdent(); continue; }

            
            this.readOperator();
        }

        this.add(TokenType.EOF, null);
        return this.tokens;
    }

    skipWhitespaceAndComments() {
        while (!this.isEnd()) {
            const ch = this.peek();
            
            if (ch === ' ' || ch === '\r' || ch === '\t') { this.advance(); continue; }
            
            if (ch === '/' && this.peek(1) === '/') {
                while (!this.isEnd() && this.peek() !== '\n') this.advance();
                continue;
            }
            
            if (ch === '/' && this.peek(1) === '*') {
                this.advance(); this.advance();
                while (!this.isEnd() && !(this.peek() === '*' && this.peek(1) === '/')) this.advance();
                this.advance(); this.advance();
                continue;
            }
            break;
        }
    }

    readNumber() {
        let num = '';
        while (!this.isEnd() && (this.isDigit(this.peek()) || this.peek() === '.')) {
            num += this.advance();
        }
        this.add(TokenType.NUMBER, num.includes('.') ? parseFloat(num) : parseInt(num));
    }

    readString(quote) {
        this.advance(); 
        let str = '';
        while (!this.isEnd() && this.peek() !== quote) {
            if (this.peek() === '\\') { this.advance(); str += this.escape(this.advance()); }
            else str += this.advance();
        }
        this.advance(); 
        this.add(TokenType.STRING, str);
    }

    escape(ch) {
        switch (ch) {
            case 'n': return '\n';
            case 't': return '\t';
            case 'r': return '\r';
            default:  return ch;
        }
    }

    readVar() {
        let name = '';
        while (!this.isEnd() && (this.isAlphaNum(this.peek()) || this.peek() === '_')) {
            name += this.advance();
        }
        this.add(TokenType.VAR, name);
    }

    readConst() {
        let name = '';
        while (!this.isEnd() && (this.isAlphaNum(this.peek()) || this.peek() === '_')) {
            name += this.advance();
        }
        this.add(TokenType.CONST, name);
    }

    readIdent() {
        let word = '';
        while (!this.isEnd() && (this.isAlphaNum(this.peek()) || this.peek() === '_')) {
            word += this.advance();
        }
        const type = KEYWORDS[word] ?? TokenType.IDENT;
        const value = (type === TokenType.BOOL) ? word === 'true' : word;
        this.add(type, value);
    }

    readOperator() {
        const ch = this.advance();
        switch (ch) {
            case '(':  this.add(TokenType.LPAREN,    '('); break;
            case ')':  this.add(TokenType.RPAREN,    ')'); break;
            case '{':  this.add(TokenType.LBRACE,    '{'); break;
            case '}':  this.add(TokenType.RBRACE,    '}'); break;
            case '[':  this.add(TokenType.LBRACKET,  '['); break;
            case ']':  this.add(TokenType.RBRACKET,  ']'); break;
            case ',':  this.add(TokenType.COMMA,     ','); break;
            case '.':  this.add(TokenType.DOT,       '.'); break;
            case ';':  this.add(TokenType.SEMICOLON, ';'); break;
            case ':':  this.add(TokenType.COLON,     ':'); break;
            case '%':  this.add(TokenType.PERCENT,   '%'); break;
            case '!':
                if (this.peek() === '=') { this.advance(); this.add(TokenType.NEQ, '!='); }
                else this.add(TokenType.NOT, '!');
                break;
            case '=':
                if (this.peek() === '=') { this.advance(); this.add(TokenType.EQ, '=='); }
                else this.add(TokenType.ASSIGN, '=');
                break;
            case '<':
                if (this.peek() === '=') { this.advance(); this.add(TokenType.LTE, '<='); }
                else this.add(TokenType.LT, '<');
                break;
            case '>':
                if (this.peek() === '=') { this.advance(); this.add(TokenType.GTE, '>='); }
                else this.add(TokenType.GT, '>');
                break;
            case '+':
                if (this.peek() === '+')      { this.advance(); this.add(TokenType.INC,    '++'); }
                else if (this.peek() === '=') { this.advance(); this.add(TokenType.PLUSEQ, '+='); }
                else this.add(TokenType.PLUS, '+');
                break;
            case '-':
                if (this.peek() === '-')      { this.advance(); this.add(TokenType.DEC,     '--'); }
                else if (this.peek() === '=') { this.advance(); this.add(TokenType.MINUSEQ, '-='); }
                else this.add(TokenType.MINUS, '-');
                break;
            case '*':
                if (this.peek() === '=') { this.advance(); this.add(TokenType.STAREQ, '*='); }
                else this.add(TokenType.STAR, '*');
                break;
            case '/':
                if (this.peek() === '=') { this.advance(); this.add(TokenType.SLASHEQ, '/='); }
                else this.add(TokenType.SLASH, '/');
                break;
            case '&':
                if (this.peek() === '&') { this.advance(); this.add(TokenType.AND, '&&'); }
                break;
            case '|':
                if (this.peek() === '|') { this.advance(); this.add(TokenType.OR, '||'); }
                break;
            default:
                
                break;
        }
    }

    isDigit(ch)    { return ch >= '0' && ch <= '9'; }
    isAlpha(ch)    { return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_'; }
    isAlphaNum(ch) { return this.isAlpha(ch) || this.isDigit(ch); }
}


if (typeof module !== 'undefined') module.exports = { Lexer, Token, TokenType, KEYWORDS };
