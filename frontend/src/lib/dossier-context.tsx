import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export interface DossierTarget {
  companyKey: string
  companyName: string
  companyNumber?: string
  companyType?: string
  region?: string
}

interface DossierContextValue {
  target: DossierTarget | null
  isOpen: boolean
  openDossier: (
    companyKey: string,
    companyName: string,
    companyNumber?: string,
    companyType?: string,
    region?: string,
  ) => void
  closeDossier: () => void
}

const DossierContext = createContext<DossierContextValue | null>(null)

export function useDossier() {
  const ctx = useContext(DossierContext)
  if (!ctx) throw new Error('useDossier must be used within DossierProvider')
  return ctx
}

export function DossierProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<DossierTarget | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const openDossier = useCallback(
    (companyKey: string, companyName: string, companyNumber?: string, companyType?: string, region?: string) => {
      setTarget({ companyKey, companyName, companyNumber, companyType, region })
      setIsOpen(true)
    },
    [],
  )

  const closeDossier = useCallback(() => {
    setIsOpen(false)
    // Delay clearing target so exit animation can play
    setTimeout(() => setTarget(null), 300)
  }, [])

  return (
    <DossierContext.Provider value={{ target, isOpen, openDossier, closeDossier }}>
      {children}
    </DossierContext.Provider>
  )
}
