// A small compound Card, built on the existing `.card` CSS so it looks exactly like the cards every
// feature already draws by hand - this just gives repeated shapes a name instead of re-typing the markup.
//
//   <Card><Card.Title>Technicians</Card.Title>...</Card>              - a titled panel
//   <StatGrid items={[['Booked jobs', 12], ['Done', 9]]} />            - the row of number cards
import { Icon } from './Icon.jsx';

export function Card({ as: Tag = 'div', className = '', children, ...rest }) {
  return <Tag className={`card ${className}`.trim()} {...rest}>{children}</Tag>;
}

Card.Title = function CardTitle({ children }) {
  return <h2>{children}</h2>;
};

Card.Row = function CardRow({ className = '', children }) {
  return <div className={`row wrap ${className}`.trim()}>{children}</div>;
};

// The repeated "cards" grid of single-number stat cards (dashboard, billing, tracking, usage).
// items: [[label, value], ...], [[label, value, hint], ...] or [[label, value, hint, icon], ...] - value
// can be any node (text, a formatted number, a badge); hint is a short line of muted detail under the
// number (e.g. "4 in, 2 out"); icon is an optional Icon.jsx name shown in a small badge, top right.
export function StatGrid({ items, className = '' }) {
  return (
    <div className={`cards ${className}`.trim()}>
      {items.map(([label, value, hint, icon]) => (
        <div key={label} className="card stat">
          <div className="stat__head">
            <h3>{label}</h3>
            {icon ? <span className="stat__icon"><Icon name={icon} /></span> : null}
          </div>
          <p className="stat__value">{value}</p>
          {hint ? <small className="muted">{hint}</small> : null}
        </div>
      ))}
    </div>
  );
}
