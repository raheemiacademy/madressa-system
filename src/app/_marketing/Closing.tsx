import { d } from './bits';

export function Closing() {
  return (
    <section className="section field-white" aria-labelledby="close-title">
      <div className="wrap closing">
        <h2 id="close-title" data-rise data-words>Give your teachers their evenings back</h2>
        <div className="actions" data-rise style={d(1)}>
          <p>Less chasing, typing and searching. More time for the children and the Quran.</p>
          <a className="btn btn-primary" href="#early-access">Start free trial</a>
          <a href="/features">See every feature</a>
        </div>
      </div>
    </section>
  );
}
