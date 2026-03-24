import { Link } from 'react-router-dom';

export function AffiliateNotice() {
  return (
    <p className="text-[10px] leading-tight text-muted-foreground/60 text-center mt-2">
      As a Booking.com affiliate, we earn from qualifying bookings — at no extra cost to you.{' '}
      <Link to="/affiliate-disclosure" className="underline hover:text-muted-foreground transition-colors">
        Learn more
      </Link>
    </p>
  );
}
