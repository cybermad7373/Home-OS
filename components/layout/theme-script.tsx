/**
 * Applies the stored theme before first paint. Without this the page flashes
 * light before the toggle's choice is read back from localStorage.
 *
 * This is the only script this app writes itself, so it is also the only one
 * Next does not stamp a nonce onto: Next nonces the tags it generates, and
 * this one is ours. Without the nonce the Content-Security-Policy refuses it
 * and every visit flashes the wrong theme.
 */
const script = `(function(){try{var t=localStorage.getItem("houseos-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;

export function ThemeScript({ nonce }: { nonce?: string }) {
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: script }} />;
}
