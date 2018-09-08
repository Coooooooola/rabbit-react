/**
  serious code coupling!!! but i'm not going to redesign it because it cannot make money. Q.Q pooooor rabbit
*/

// tools
Array.prototype.flatMap = function (depth = Infinity) {
  return depth <= 0
    ? this.slice()
    : this.reduce((a, b) => a.concat(b instanceof Array ? b.flatMap(depth - 1) : b), [])
}


// all lifecycles are pending to implement
class Component {
  constructor(props) {
    this.props = props
    this.state = null
  }
  setState(arg, callback) {
    const typeofArg = typeof arg
    if (typeofArg !== 'object' && typeofArg !== 'function'
        || callback && typeof callback !== 'function') {
      throw new Error('invalid type of arguments of setState(arg: object|function, callback: function?)')
    }
    React.enqueueSetStates(this, arg, callback)
    Promise.resolve().then(() => {
      React.renderState(ReactReconciler.render)
    })
  }
  // temporarily remove
  forceUpdate() {}
  // temporarily remove
  shouldComponentUpdate(nextProps, nextState) {
    return true
  }
  render() {}
  // remove
  getSnapshotBeforeUpdate(prevProps, prevState) {
    return null
  }
  componentDidMount() {}
  componentDidUpdate(prevProps, prevState, snapsshot) {}
  componentWillUnmount() {}
}
// remove
Component.getDerivedStateFromProps = function (props, state) {
  return null
}


/**
  React Engine

  generate components and render elements
*/
const React = {
  engine: {
    // weights: new Map(),
    pendingSetStateComponents: new Map(),
    pendingRenderComponents: new Set()
  },
  Component,
  Element: class {
    constructor(type, key, ref, props) {
      this.type = type
      this.key = key
      this.ref = ref
      this.props = props
      this._maker = null
    }
  },
  createElement(type, config, ...children) {
    const {key = null, ref = null, ...rest} = config || {}
    return new React.Element(type, key, ref, {...rest, children})
  },
  render(component) {
    const element = component.render()
    element._maker = component
    return element
  },
  newComponent(Component, props, order = 0) {
    // const {weights} = React.engine
    const component = new Component(props)
    // weights.set(component, order + 1)
    return component
  },
  enqueueSetStates(component, updater, callback) {
    const {pendingSetStateComponents} = React.engine
    let pack = null
    if (!pendingSetStateComponents.has(component)) {
      pack = {updaters: [], callbacks: []}
      pendingSetStateComponents.set(component, pack)
    } else {
      pack = pendingSetStateComponents.get(component)
    }
    const {updaters, callbacks} = pack
    updaters.push(updater)
    if (callback) {
      callbacks.push(callback)
    }
  },
  renderState(handler) {
    const {_updateStates, _updateRenders, engine: {pendingSetStateComponents}} = React
    if (pendingSetStateComponents.size) {
      _updateStates()
      _updateRenders(handler)
    }
  },

  _updateStates() {
    const {pendingSetStateComponents, pendingRenderComponents} = React.engine
    for (const [component, {updaters, callbacks}] of pendingSetStateComponents) {
      const {state, props} = component
      const newStates = updaters.map(updater => typeof updater === 'object' ? updater : updater(state, props))
      Object.assign(state, ...newStates)
      callbacks.forEach(callback => callback())
      pendingRenderComponents.add(component)
    }
    pendingSetStateComponents.clear()
  },
  _updateRenders(handler) {
    const {pendingRenderComponents, weights} = React.engine
    const components = [...pendingRenderComponents]
    components.sort((a, b) => weights.get(b) - weights.get(a))
      .forEach(component => {
        const element = React.render(component)
        handler(element)
      })
    pendingRenderComponents.clear()
  }
}


/**
  ReactReconciler Engine

  manage component and dom-node-tree
*/
const ReactReconciler = {
  engine: {
    componentToNode: new Map()
  },
  Node(element) {
    if (typeof element === 'string' || typeof element === 'number') {
      return {
        type: null,
        text: `${element}`,
        domNode: null,

        nextSibling: null,
        preSibling: null,
        parent: null
      }
    }
    const {type, props} = element
    if (typeof type === 'function') {
      return {
        type,
        ref: null,
        component: null,
        domNode: null,
        childDomNode: null,

        firstChild: null,
        nextSibling: null,
        preSibling: null,
        parent: null
      }
    }
    const {id = null, className = null, style = null, value = null, ...candidates} = props
    const reg = /^on([A-Z][a-zA-Z]+)$/
    const handlers = Object.keys(candidates)
      .map(key => {
        const matched = reg.exec(key)
        return matched && matched[1]
      })
      .filter(key => key !== null)
      .reduce((a, b) => {
        a[b.toLowerCase()] = candidates['on' + b]
        return a
      }, {})
    return {
      type,
      id,
      className,
      style,
      value,
      handlers,

      domNode: null,

      firstChild: null,
      nextSibling: null,
      preSibling: null,
      parent: null
    }
  },
  _diff(newNode, oldNode) {
    console.log('newNode', newNode)
    console.log('oldNode', oldNode)
    const {diffCollector} = ReactDOM.engine
    if (!newNode) {
      if (oldNode.domNode) {
        diffCollector.remove.push(oldNode)
      } else {
        ReactReconciler.engine.componentToNode.delete(oldNode._maker)
      }
      return true
    }
    if (!oldNode) {
      diffCollector.add.push(newNode)
      return true
    }
    if (newNode.type !== oldNode.type) {
      diffCollector.remove.push(oldNode)
      diffCollector.add.push(newNode)
      return true
    }
    newNode.domNode = oldNode.domNode
    if (newNode.type === null) {
      if (newNode.text !== oldNode.text) {
        diffCollector.remove.push(oldNode)
        diffCollector.add.push(newNode)
      }
      return false
    }
    const attrs = ['id', 'className', 'style', 'value'].filter(key => key === 'value' || newNode[key] !== oldNode[key]).reduce((a, b) => {
      a[b] = newNode[b]
      return a
    }, {})
    if (Object.keys(attrs).length) {
      diffCollector.setAttributes.push([newNode, attrs])
      return false
    }
    return false
  },
  _traverse(element, oldNode, preSibling, parent) {
    const {engine: {componentToNode}, Node, _traverse, _diff} = ReactReconciler
    element = element === null || element === false ? '' : element
    const newNode = Node(element)
    newNode.preSibling = preSibling
    newNode.parent = parent
    const isDiff = _diff(newNode, oldNode)
    const {type} = element
    if (typeof type === 'function') {
      if (parent.domNode) {
        newNode.domNode = parent.domNode
      }
      if (oldNode && oldNode.childDomNode) {
        newNode.childDomNode = oldNode.childDomNode
      }
      if (Object.getPrototypeOf(type) === React.Component) {
        const component = oldNode && oldNode.component || React.newComponent(type, element.props)
        component.props = element.props
        newNode.component = component
        componentToNode.set(component, newNode)
        newNode.firstChild = _traverse(React.render(component), isDiff ? null : oldNode && oldNode.firstChild, null, newNode)
      } else {
        console.log('--------------------------')
        newNode.firstChild = _traverse(type(element.props), isDiff ? null : oldNode && oldNode.firstChild, null, newNode)
      }
      return newNode
    }

    const children = element.props && element.props.children.flatMap()
    if (Array.isArray(children)) {
      let pointer = oldNode && oldNode.firstChild
      let memoSibling = null
      if (children.length) {
        memoSibling = newNode.firstChild = _traverse(children[0], isDiff ? null : pointer, null, newNode)
        pointer = pointer && pointer.nextSibling
      }
      for (let i = 1; i < children.length; i++) {
        const tp = _traverse(children[i], pointer, memoSibling, newNode)
        pointer = pointer && pointer.nextSibling
        memoSibling.nextSibling = tp
        memoSibling = tp
      }
      while (pointer) {
        _diff(null, pointer)
        pointer = pointer.nextSibling
      }
    }
    return newNode
  },
  render(element, domNode) {
    const {engine: {componentToNode}, _diff} = ReactReconciler
    const rootNode = element._maker && componentToNode.get(element._maker) || {type: null, domNode, firstChild: null}
    const node = rootNode && rootNode.firstChild || null
    const newNode = ReactReconciler._traverse(element, node, node && node.preSibling, rootNode)
    rootNode.firstChild = newNode
    if (node) {
      newNode.parent = node.parent
      if (node.preSibling) {
        newNode.preSibling = node.preSibling
        node.preSibling.nextSibling = newNode
      }
    }
    ReactDOM.renderDiff()
    return newNode
  }
}


/**
  ReactDOM Engine

  not implement key yet, so there is no move operation (maybe i will never implement it due to no reward)
*/
const ReactDOM = {
  engine: {
    DOMtoNode: new Map(),
    diffCollector: {
      add: [],
      remove: [],
      setAttributes: [] // [node, {}]
    }
  },
  renderDiff() {
    const {diffCollector, DOMtoNode} = ReactDOM.engine
    console.log(Object.assign({}, diffCollector))

    diffCollector.remove.forEach(node => {
      if (typeof node.type === 'function') {
        node.childDomNode.remove()
      } else {
        node.domNode.remove()
      }
    })
    
    diffCollector.add.forEach(node => {
      if (typeof node.type === 'function') {
        node.domNode = node.parent.domNode
        return
      }
      const domNode = node.type !== null ? document.createElement(node.type) : document.createTextNode(node.text)
      node.domNode = domNode
      DOMtoNode.set(domNode, node)
      
      let pointer = node.parent
      let pre = null
      while (typeof pointer.type === 'function') {
        pointer.childDomNode = domNode
        pre = pointer.preSibling
        pointer = pointer.parent
      }

      if (pre) {
        console.log('+++++++++++++++', node, pre)
        node.parent.domNode.insertBefore(domNode, pre.domNode.nextSibling)
      } else if (node.preSibling) {
        const reference = typeof node.preSibling.type === 'function' ? node.preSibling.childDomNode : node.preSibling.domNode
        node.parent.domNode.insertBefore(domNode, reference.nextSibling)
      } else {
        node.parent.domNode.insertBefore(domNode, node.parent.domNode.firstChild)
      }

      if (node.type !== null) {
        ['id', 'className'].filter(key => node[key] != null).forEach(key => {
          domNode.setAttribute(key === 'className' ? 'class' : key, node[key])
        })
        if (node.style) {
          const styleStr = Object.keys(node.style).reduce((a, b) => {
            a.push(`${b}:${node.style[b]}`)
            return a
          }, []).join(';')
          domNode.setAttribute('style', styleStr)
        }
      }
    })
    
    diffCollector.setAttributes.forEach(([node, attrs]) => {
      const {style, ...rest} = attrs
      Object.keys(rest).forEach(key => {
        node.domNode[key === 'className' ? 'class' : key] = rest[key] || ''
      })
      if (style) {
        const styleStr = Object.keys(style).reduce((a, b) => {
          a.push(`${b}:${style[b]}`)
          return a
        }, []).join(';')
        node.domNode.setAttribute('style', styleStr)
      }
    })

    diffCollector.remove = []
    diffCollector.add = []
    diffCollector.setAttributes = []
  },
  // only support bubble
  // no stop propagation
  // only listen click, change, and input
  eventProxy(node, eventType, event) {
    const path = []
    while (node) {
      if (typeof node.type === 'string' && node.handlers[eventType]) {
        path.push(node.handlers[eventType])
      }
      node = node.parent
    }
    console.log(path)
    path.forEach(handler => {
      handler(event)
    })
  },
  signupEventProxy() {
    ['click', 'change', 'input'].forEach(eventType => {
      const {DOMtoNode} = ReactDOM.engine
      document.addEventListener(eventType, event => {
        console.log('getting')
        const node = DOMtoNode.get(event.target)
        if (node) {
          ReactDOM.eventProxy(node, eventType, event)
        }
      })
    })
  },
  render(element, container, callback) {
    const node = ReactReconciler.render(element, container)
    container.innerHTML = ''
    ReactDOM.signupEventProxy()
    container.append(node.firstChild.domNode)
    if (callback) {
      callback()
    }
  }
}














































function Nav(props) {
  return <div id="11111">{props.name}<span className="coool">Q.Q</span>{props.children}</div>
}


class Main extends React.Component {
  render() {
    return (
      <div>
        yes
        <p>meow!!!</p>
      </div>
    )
  }
}
var T = ({color}) => <Nav name="rabbit" ref={a => a}>
  <div className="q.q" onClick={() => {}}>Q.Q</div>
  <span style={{width: '100px', color, margin: '100px'}}>cool</span>
      <Main />
</Nav>

var b = <Main></Main>

var t = <T color="green" />
    
var Oops = ({color}) => (
  <div>
    <h1 style={{color}}>this is Oops</h1>
    <p>oooooooooooooooooooooooooooooops</p>
  </div>
)

var a = <Oops color="red" />
  
class App extends React.Component {
  constructor() {
    super()
    this.state = {name: 'oooops', color: 'red', el: b, value: '', inc: 0, randColor: '#' + Math.floor((Math.random() * 0x1000000)).toString(16).padStart(6)}
    setTimeout(() => {
      this.setState({name: 'rabbit', color: 'pink', el: a})
    }, 3000)
  }
  handleClick = () => {
    this.setState(({inc}) => ({inc: inc + 1}))
  }
  randColorClick = () => {
    this.setState({randColor: '#' + Math.floor((Math.random() * 0x1000000)).toString(16).padStart(6)})
  }
  render() {
      const {name, color, el, value, inc, randColor} = this.state
      return (
        <div>
          {name}
          <T color={color} />
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
          {el}
          -----------------------------
          <p />
          {name === 'rabbit' && <Oops color={color} />}
          {['hi', 'yes', <p>ending</p>]}
          <div>
            <h1>value(cannot input blank ' '): '{value}'</h1>
            <input value={value} onInput={e => {this.setState({value: e.target.value.split(' ').join('')})}} />
          </div>
          <div onClick={this.randColorClick} style={{'background-color': randColor}}>
            <p>click generate random color</p>
            <h1>inc: {inc}</h1>
            <button onClick={this.handleClick}>inc btn:{inc}</button>
          </div>
        </div>
      )
    }
}
          // stable~~~~~
          // <Main what="damn it" />
          // stable toooooo
          // <h1>hello!!! {name}</h1>
          // <p>a paragraph</p>
          // {null}
          // {temp1}

ReactDOM.render(
  <App />,
    document.body
)







