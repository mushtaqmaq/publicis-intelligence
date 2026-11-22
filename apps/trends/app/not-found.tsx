import Link from 'next/link';
export default function NotFound() { return <div className="empty"><b>That trend was not found</b><p>It may have been removed, or the link is wrong.</p><Link className="btn" href="/">Back to the radar</Link></div>; }
