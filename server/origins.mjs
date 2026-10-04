// The original GitHub Pages game and the Worker share the same Duel lobby.
export function allowsDuelOrigin(origin,serverOrigin){
  return origin===serverOrigin||origin==='https://3wasfnjd.github.io';
}
