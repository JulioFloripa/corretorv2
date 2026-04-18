import flemingLogo from "@/assets/fleming-logo.png";

interface FlemingLogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

const FlemingLogo = ({ size = "md", showText = true }: FlemingLogoProps) => {
  const sizeClasses = {
    sm: "h-6 w-auto",
    md: "h-8 w-auto",
    lg: "h-10 w-auto"
  };

  const textSizeClasses = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-3xl"
  };

  return (
    <div className="flex items-center gap-2">
      <img src={flemingLogo} alt="Fleming Logo" className={sizeClasses[size]} />
      {showText && (
        <h1 className={`${textSizeClasses[size]} font-bold text-foreground`}>
          Fleming
        </h1>
      )}
    </div>
  );
};

export default FlemingLogo;
