// A small compound Card, built on the existing `.card` CSS so it looks exactly like the cards every
// feature already draws by hand - this just gives repeated shapes a name instead of re-typing the markup.
//
//   <Card><Card.Title>Technicians</Card.Title>...</Card>              - a titled panel
//   <StatGrid items={[['Booked jobs', 12], ['Done', 9]]} />            - the row of number cards

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
// items: [[label, value], ...] or [[label, value, hint], ...] - value can be any node (text, a formatted number, a badge);
// hint is a short line of muted detail under the number (e.g. "4 in, 2 out").
export function StatGrid({ items }) {
  return (
    <div className="cards">
      {items.map(([label, value, hint]) => (
        <div key={label} className="card stat">
          <h3>{label}</h3>
          <p className="stat__value">{value}</p>
          {hint ? <small className="muted">{hint}</small> : null}
        </div>
      ))}
    </div>
  );
}
