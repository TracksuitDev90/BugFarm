// Minimal event emitter used for world -> journal/audio/ui notifications.
export class Emitter {
  constructor() {
    this.map = new Map();
  }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, []);
    this.map.get(type).push(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) {
    const list = this.map.get(type);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
  emit(type, data) {
    const list = this.map.get(type);
    if (list) for (let i = 0; i < list.length; i++) list[i](data);
    const any = this.map.get('*');
    if (any) for (let i = 0; i < any.length; i++) any[i](type, data);
  }
}
