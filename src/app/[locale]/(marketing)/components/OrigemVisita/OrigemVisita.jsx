"use client";
import { useEffect } from "react";
import { guardarOrigemVisita } from "@/lib/origemVisita";

// Guarda as UTMs e a página de entrada da primeira página vista nesta sessão.
export default function OrigemVisita() {
  useEffect(() => {
    guardarOrigemVisita();
  }, []);

  return null;
}
