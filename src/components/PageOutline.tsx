/**
 * A slow page's shape (heading, a button, rows) in the dashboard's pulsing grey blocks, shown by the admin Shell the moment a
 * link to one is clicked, so a tap never looks ignored. The page itself then fades in (.ra-in on its root).
 */
export function PageOutline() {
  return (
    <div className="ra-page" role="status" aria-label="Loading">
      <div className="ra-page-h">
        <div style={{ flex: 1 }}><span className="ra-skel" style={{ display: 'block', height: 32, width: 200 }} /><span className="ra-skel" style={{ display: 'block', height: 14, width: 280, maxWidth: '100%', marginTop: 10 }} /></div>
        <span className="ra-skel" style={{ width: 96, height: 40, borderRadius: 10 }} />
      </div>
      <div className="ra-card">
        {[40, 92, 78, 86, 70, 82, 64].map((w, i) => <span key={i} className="ra-skel" style={{ display: 'block', height: i ? 18 : 14, width: `${w}%`, marginTop: i ? 16 : 0 }} />)}
      </div>
    </div>
  );
}
