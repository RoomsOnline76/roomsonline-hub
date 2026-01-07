import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <PublicLayout>
      <div className="flex flex-1 items-center justify-center py-16">
        <div className="text-center max-w-md px-4">
          <h1 className="font-display text-7xl sm:text-8xl font-light text-primary mb-4">404</h1>
          <h2 className="font-display text-2xl sm:text-3xl font-light text-foreground mb-4">
            Page not found
          </h2>
          <p className="text-muted-foreground mb-8">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <Button asChild size="lg">
            <Link to="/">
              <Home className="h-4 w-4 mr-2" />
              Return Home
            </Link>
          </Button>
        </div>
      </div>
    </PublicLayout>
  );
};

export default NotFound;
