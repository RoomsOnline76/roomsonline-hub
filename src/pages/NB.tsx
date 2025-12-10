import { Navbar } from "@/components/Navbar";

const NB = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">NB</h1>
        <p className="text-muted-foreground mt-2">Dev-only page</p>
      </div>
    </div>
  );
};

export default NB;
