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
    if (typeof element === 'string') {
      return {
        type: null,
        text: element,
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
    const {id = null, className = null, style = null, ...candidates} = props
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
      return
    }
    if (!oldNode) {
      diffCollector.add.push(newNode)
      return
    }
    if (newNode.type !== oldNode.type || newNode.type === null && newNode.text !== oldNode.text) {
      diffCollector.remove.push(oldNode)
      diffCollector.add.push(newNode)
      return
    }
    const attrs = ['id', 'className', 'style'].filter(key => newNode[key] !== oldNode[key]).reduce((a, b) => {
      a[b] = newNode[b]
      return a
    },{})
    newNode.domNode = oldNode.domNode
    diffCollector.setAttributes.push([newNode, attrs])
  },
  _traverse(element, oldNode, handler, preSibling, parent) {
    const {engine: {componentToNode}, Node, _traverse} = ReactReconciler
    element = element || ''
    const newNode = Node(element)
    newNode.preSibling = preSibling
    newNode.parent = parent
    handler(newNode, oldNode)
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
        newNode.firstChild = _traverse(React.render(component), oldNode && oldNode.firstChild, handler, null, newNode)
      } else {
        newNode.firstChild = _traverse(type(element.props), oldNode && oldNode.firstChild, handler, null, newNode)
      }
      return newNode
    }

    const children = element.props && element.props.children.flatMap()
    if (Array.isArray(children)) {
      let pointer = oldNode && oldNode.firstChild
      let memoSibling = null
      if (children.length) {
        memoSibling = newNode.firstChild = _traverse(children[0], pointer, handler, null, newNode)
        pointer = pointer && pointer.nextSibling
      }
      for (let i = 1; i < children.length; i++) {
        const tp = _traverse(children[i], pointer, handler, memoSibling, newNode)
        pointer = pointer && pointer.nextSibling
        memoSibling.nextSibling = tp
        memoSibling = tp
      }
      while (pointer) {
        handler(null, pointer)
        pointer = pointer.nextSibling
      }
    }
    return newNode
  },
  render(element, domNode) {
    const {engine: {componentToNode}, _diff} = ReactReconciler
    const node = element._maker && componentToNode.get(element._maker).firstChild || null
    const newNode = ReactReconciler._traverse(element, node, _diff, node && node.preSibling, domNode ? {domNode} : node && node.parent)
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

    diffCollector.remove.map(node => node.domNode).forEach(domNode => {
      domNode.remove()
    })
    
    diffCollector.add.forEach(node => {
      if (typeof node.type === 'function') {
        node.domNode = node.parent.domNode
        return
      }
      const domNode = node.type !== null ? document.createElement(node.type) : document.createTextNode(node.text)
      node.domNode = domNode
      
      let pointer = node.parent
      let pre = null
      while (typeof pointer.type === 'function') {
        pointer.childDomNode = domNode
        pre = pointer.preSibling
        pointer = pointer.parent
      }

      if (pre) {
        node.parent.domNode.insertBefore(domNode, pre.domNode.sibling)
      } else if (node.preSibling) {
        const reference = typeof node.preSibling.type === 'function' ? node.preSibling.childDomNode : node.preSibling.domNode
        node.parent.domNode.insertBefore(domNode, reference.sibling)
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
        node.domNode.setAttribute(key === 'className' ? 'class' : key, rest[key] || '')
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
  render(element, container, callback) {
    const node = ReactReconciler.render(element, container)
    container.innerHTML = ''
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
var T = ({color}) => <Nav name="rabbit" ref={a => a} onChange={() => {}}>
  <div className="q.q" onClick={() => {}}>Q.Q</div>
  <span style={{width: '100px', color, margin: '100px'}}>cool</span>
      <Main />
</Nav>

var b = <Main>
  <Nav updater="hi"/>
  <footer></footer>
</Main>

var t = <T color="green" />
  
class App extends React.Component {
  constructor() {
  	super()
    this.state = {name: 'oooops', color: 'red'}
    setTimeout(() => {
    	this.setState({name: 'rabbit', color: 'pink'})
    }, 3000)
  }
	render() {
      const {name, color} = this.state
      return (
      	<div>
          {name}
          <T color={color} />
          {t}
          {['hi', 'yes', <p>ending</p>]}
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







