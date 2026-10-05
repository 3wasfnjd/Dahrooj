// The GitHub Pages game, branch previews on raw.githack.com and the Worker share the same Duel lobby.
export function allowsDuelOrigin(origin,serverOrigin){
  return origin===serverOrigin||origin==='https://3wasfnjd.github.io'||origin==='https://raw.githack.com';
}
