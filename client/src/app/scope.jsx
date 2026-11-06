import { Globe, MapPin, Sparkles, Wifi } from 'lucide-react';
import { cx } from '@/app/ui';

// The three controls that decide *what you're looking at*, shared by Explore and For you:
// level (internships / jobs), who backs the startup (YC / Techstars) and where the role is.

export const REGIONS = [
  ['', 'Anywhere', [], Globe],
  ['india', 'India', ['india_onsite', 'remote_india'], MapPin],
  ['remote', 'Remote', ['remote_india', 'remote_worldwide', 'remote_region'], Wifi],
  ['abroad', 'Outside India', ['abroad_onsite'], MapPin],
];
const same = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
export const regionOf = (loc = []) => REGIONS.find(([, , tags]) => same(tags, loc))?.[0] ?? null;
export const regionTags = (id) => REGIONS.find(([k]) => k === id)?.[2] ?? [];

/** Pill toggle: All / Internships / Jobs, with live counts. */
export function KindToggle({ value, onChange, counts = {} }) {
  const items = [['', 'All', (counts.intern || 0) + (counts.job || 0)], ['intern', 'Internships', counts.intern], ['job', 'Jobs', counts.job]];
  return (
    <div className="seg kind" role="tablist" aria-label="Internships or jobs">
      {items.map(([id, label, n]) => (
        <button key={id || 'all'} role="tab" aria-selected={value === id} className={cx(value === id && 'on')} onClick={() => onChange(id)}>
          {label}{n ? <span className="n tab">{n.toLocaleString('en-IN')}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Y Combinator / Techstars chips. */
export function BackedChips({ value, onChange, facets }) {
  const toggle = (id) => onChange(value === id ? '' : id);
  return (
    <div className="chiprow" role="group" aria-label="Backed by">
      <span className="chip-label"><Sparkles /> Backed by</span>
      <div className="chips">
      <button className="fchip" aria-pressed={value === 'yc'} onClick={() => toggle('yc')}>
        <i className="y">Y</i> Y Combinator {facets?.yc ? <span className="n tab">{facets.yc}</span> : null}
      </button>
      <button className="fchip" aria-pressed={value === 'techstars'} onClick={() => toggle('techstars')}>
        <i className="y t">T</i> Techstars {facets?.techstars ? <span className="n tab">{facets.techstars}</span> : null}
      </button>
      <button className="fchip" aria-pressed={value === 'any'} onClick={() => toggle('any')}>Either</button>
      </div>
    </div>
  );
}

/** Where: anywhere / India / remote / outside India. */
export function RegionChips({ loc, onChange }) {
  const current = regionOf(loc);
  return (
    <div className="chiprow" role="group" aria-label="Where">
      <span className="chip-label"><Globe /> Where</span>
      <div className="chips">
      {REGIONS.map(([id, label, tags, Icon]) => (
        <button key={id || 'any'} className="fchip" aria-pressed={current === id} onClick={() => onChange(tags)}>
          <Icon /> {label}
        </button>
      ))}
      </div>
    </div>
  );
}
