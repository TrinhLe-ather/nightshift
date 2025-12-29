import { Container } from "@/components/layout/Container";

interface LoadingProps {
  message?: string;
  className?: string;
}

export function Loading({ message = "Loading...", className }: LoadingProps) {
  return (
    <Container className={className ?? "py-4 lg:py-6"}>
      <div className="flex flex-col items-center justify-center py-20">
        <div className="relative">
          <div className="h-12 w-12" />
          <div className="absolute inset-0 h-12 w-12 rounded-full animate-spin border-2 border-primary border-t-transparent" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{message}</p>
      </div>
    </Container>
  );
}
