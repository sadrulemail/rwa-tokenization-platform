"use client";

import { lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";

import { SessionProvider } from "@/lib/session";
import { wagmiConfig } from "@/lib/wagmi";
import { Toaster } from "./toaster";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 2_000, retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <RainbowKitProvider
            modalSize="compact"
            theme={lightTheme({ accentColor: "#0d9488", borderRadius: "medium" })}
            appInfo={{ appName: "RWA Tokenization Platform" }}
          >
            <Toaster>{children}</Toaster>
          </RainbowKitProvider>
        </SessionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
