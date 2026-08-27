/**
 * Applies the stored theme before first paint. Without this the page flashes
 * light before the toggle's choice is read back from localStorage.
 */
const script = `(function(){try{var t=localStorage.getItem("houseos-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
