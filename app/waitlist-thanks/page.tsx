import Link from "next/link";

export default function WaitlistThanks() {
  return (
    <div className="thanks-wrap">
      <div className="thanks-card">
        <div className="thanks-check">✓</div>
        <h1>You&apos;re on the list.</h1>
        <p>
          We&apos;ll email you the moment sign-up opens, in the order people joined. Your founder
          pricing is locked in from today.
        </p>
        <Link href="/" className="btn btn-ghost">Back to home</Link>
      </div>
    </div>
  );
}
