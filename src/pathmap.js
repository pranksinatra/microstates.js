import { methodsOf } from './reflection';
import { create } from './microstates';
import { compose, view, At, Path } from './lens';
import { valueOf, Meta, childAt, defineChildren } from './meta';
import { stable } from 'funcadelic';

// TODO: explore compacting non-existent locations (from removed arrays and objects).

const SymbolLocation = Symbol('Location');
const LocationLens = compose(At(SymbolLocation), At('delegate'));

export function current(delegate) {
  return delegate.constructor.location.delegate;
}

export function idOf(pathmap) {
  return view(LocationLens, pathmap);
}

export default function Pathmap(Root, ref) {

  class Location {

    get currentValue() {
      return view(this.lens, ref.get());
    }

    // TODO: this is only to support a deprecated API
    get root() {
      if (this.parent == null) {
        return this.delegate;
      } else {
        return this.parent.root;
      }
    }

    get delegate() {
      if (!this.currentDelegate || (this.currentValue !== this.previousValue)) {
        return this.currentDelegate = this.createDelegate();
      } else {
        return this.currentDelegate;
      }
    }

    get microstate() {
      if (this.parent == null) {
        return create(Root, this.currentValue);
      } else {
        let [ key ] = this.path.slice(-1);
        let { microstate } = this.parent;
        return childAt(key, microstate);
      }
    }

    constructor(path = [], parent = null) {
      this.path = path;
      this.parent = parent;
      this.lens = Path(path);
      this.previousValue = this.currentValue;
      this.children = {};
      this.createDelegateType = stable(Type => {
        let location = this;
        let typeName = Type.name ? Type.name: 'Unknown';

        class Delegate extends Type {
          static name = `Id<${typeName}>`;
          static location = location;

          constructor(value) {
            super(value);
            console.log("value = ", value);
            defineChildren(key => idOf(location.get({}, key)), this);
            Object.defineProperty(this, Meta.symbol, { enumerable: false, configurable: true, value: new Meta(this, valueOf(value))});
          }
        }

        for (let methodName of Object.keys(methodsOf(Type)).concat("set")) {
          Delegate.prototype[methodName] = (...args) => {
            let microstate = location.microstate;
            let next = microstate[methodName](...args);
            ref.set(valueOf(next));
            // TODO: this is what we actually want.
            // return location.delegate;
            return location.root;
          };
        }

        return Delegate;
      });
    }

    createDelegate() {
      this.previousValue = this.currentValue;
      // TODO: polymorphically fetch typeOf()
      let { Type } = this.microstate.constructor;
      let Delegate = this.createDelegateType(Type);
      return new Delegate(this.currentValue);
    }

    get(target, prop) {
      if (prop === SymbolLocation) {
        return this;
      } else {
        let { children, path } = this;
        let child = children[prop];
        if (child) {
          return child;
        }
        return children[prop] = new Proxy({}, new Location(path.concat(prop), this));
      }
    }

  }

  return new Proxy({}, new Location([], null));
}