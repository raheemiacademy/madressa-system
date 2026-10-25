// The Dark mode switch keeps its choice in this cookie. The script runs in the root layout's <head> before the page
// paints, so a chosen theme never flashes the other one. (Kept out of the client component: server layouts import it.)
export const THEME_COOKIE = 'ra_theme';
export const THEME_SCRIPT = `try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)/);if(m)document.documentElement.dataset.theme=m[1]}catch(e){}`;
