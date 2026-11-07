import Link from "next/link";

export default function NotFound() {
  return (
    <div className="fail">
      <h1>Nothing is recorded here</h1>
      <p>The page or incident you asked for does not exist. It may have been removed, or the link is wrong.</p>
      <Link className="btn btn-primary" href="/dashboard">Go to the dashboard</Link>
    </div>
  );
}
