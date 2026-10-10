// Data-only parsing of object/array literals inside minified JS bundles (nothing is executed).

function parseAt(src, start) {
  let i = start
  const ws = () => {
    while (i < src.length && /\s/.test(src[i])) i++
  }
  const ident = () => {
    const m = /^[A-Za-z_$一-鿿][\w$一-鿿]*/.exec(src.slice(i, i + 200))
    if (!m) throw new Error(`identifier expected at ${i}: ${src.slice(i, i + 40)}`)
    i += m[0].length
    return m[0]
  }
  const string = () => {
    const q = src[i++]
    let out = ''
    while (src[i] !== q) {
      if (src[i] === '\\') {
        const n = src[i + 1]
        if (n === 'u') {
          out += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16))
          i += 6
          continue
        }
        out += { n: '\n', t: '\t', r: '\r' }[n] ?? n
        i += 2
        continue
      }
      out += src[i++]
    }
    i++
    return out
  }
  // skips a balanced (…), […] or {…} group, honouring strings
  const skipGroup = () => {
    const open = src[i]
    const close = { '(': ')', '[': ']', '{': '}' }[open]
    let depth = 0
    for (; i < src.length; i++) {
      const c = src[i]
      if (c === '"' || c === "'" || c === '`') {
        string()
        i--
        continue
      }
      if (c === open) depth++
      else if (c === close && --depth === 0) {
        i++
        return
      }
    }
  }
  const primary = () => {
    ws()
    const c = src[i]
    if (c === '{') {
      i++
      const obj = {}
      for (;;) {
        ws()
        if (src[i] === '}') {
          i++
          return obj
        }
        if (src.startsWith('...', i)) {
          i += 3
          const v = value()
          ;(obj.__spread ??= []).push(v)
        } else {
          let key
          if (src[i] === '"' || src[i] === "'") key = string()
          else if (src[i] === '[') {
            i++
            const k = value()
            ws()
            i++ // ]
            key = typeof k === 'object' && k?.ref ? k.ref : String(k)
          } else if (/[0-9.]/.test(src[i])) key = String(number())
          else key = ident()
          ws()
          if (src[i] === '(') {
            // method shorthand: skip params + body
            skipGroup()
            ws()
            skipGroup()
            obj[key] = { fn: true }
          } else if (src[i] === ':') {
            i++
            obj[key] = value()
          } else obj[key] = { ref: key }
        }
        ws()
        if (src[i] === ',') i++
      }
    }
    if (c === '[') {
      i++
      const arr = []
      for (;;) {
        ws()
        if (src[i] === ']') {
          i++
          return arr
        }
        if (src[i] === ',') {
          // hole
          arr.push(undefined)
          i++
          continue
        }
        arr.push(value())
        ws()
        if (src[i] === ',') i++
      }
    }
    if (c === '"' || c === "'") return string()
    if (c === '`') return string()
    if (c === '!') {
      i++
      const v = primary()
      return typeof v === 'number' ? !v : { not: v }
    }
    if (c === '-' && /[0-9.]/.test(src[i + 1])) {
      i++
      return -number()
    }
    if (/[0-9.]/.test(c)) return number()
    if (c === '(') {
      // arrow function or parenthesised expression we don't need
      skipGroup()
      ws()
      if (src.startsWith('=>', i)) {
        i += 2
        ws()
        if (src[i] === '{') skipGroup()
        else value()
      }
      return { fn: true }
    }
    const id = ident()
    if (id === 'void') {
      value()
      return undefined
    }
    if (id === 'async' || id === 'function') {
      while (i < src.length && src[i] !== '{') i++
      skipGroup()
      return { fn: true }
    }
    let ref = id
    while (src[i] === '.') {
      i++
      ref += '.' + ident()
    }
    ws()
    if (src.startsWith('=>', i)) {
      i += 2
      ws()
      if (src[i] === '{') skipGroup()
      else value()
      return { fn: true }
    }
    if (src[i] === '(') {
      skipGroup()
      return { call: ref }
    }
    return { ref }
  }
  const number = () => {
    const m = /^(0x[0-9a-f]+|\d*\.?\d+(e[+-]?\d+)?)/i.exec(src.slice(i, i + 40))
    i += m[0].length
    return Number(m[0])
  }
  // skips the rest of an expression we don't model (comparisons, ?., ??, &&, calls…)
  const skipExpr = () => {
    while (i < src.length) {
      const c = src[i]
      if (c === ',' || c === '}' || c === ']' || c === ')' || c === ';') return
      if (c === '"' || c === "'" || c === '`') {
        string()
        continue
      }
      if (c === '(' || c === '[' || c === '{') {
        skipGroup()
        continue
      }
      i++
    }
  }
  const value = () => {
    let v = primary()
    for (;;) {
      ws()
      const op = src[i]
      const handled = ',}]);*/+-?:'.includes(op)
      if (!handled || (op === '?' && (src[i + 1] === '.' || src[i + 1] === '?'))) {
        skipExpr()
        return { expr: true }
      }
      if (op === '*' || op === '/' || op === '+' || (op === '-' && src[i + 1] !== '-')) {
        i++
        const r = primary()
        if (typeof v === 'number' && typeof r === 'number') v = op === '*' ? v * r : op === '/' ? v / r : op === '+' ? v + r : v - r
        else v = { expr: true }
        continue
      }
      if (op === '?') {
        // conditional: keep neither side
        i++
        value()
        ws()
        i++
        value()
        return { expr: true }
      }
      return v
    }
  }
  const v = value()
  return { value: v, end: i }
}

/** Index of the brace closing the one at `open` (strings honoured). */
function matchBrace(src, open) {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (c === '"' || c === "'" || c === '`') {
      const q = c
      for (i++; src[i] !== q; i++) if (src[i] === '\\') i++
      continue
    }
    if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  return -1
}

const esc = (s) => s.replace(/[$]/g, '\\$')

/** Value of a top-level `NAME=…` declaration in a chunk. */
function declaration(src, name) {
  const m = new RegExp(`(?:^|[,;\\s{}(])${esc(name)}=(?=[\\[{"0-9!-])`).exec(src)
  if (!m) return undefined
  try {
    return parseAt(src, m.index + m[0].length).value
  } catch {
    return undefined
  }
}

module.exports = { parseAt, matchBrace, declaration, esc }
