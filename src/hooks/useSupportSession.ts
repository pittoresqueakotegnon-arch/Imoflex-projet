import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

const VISITOR_SESSION_KEY = 'imx_support_visitor_id';

export const useSupportSession = () => {
  const [visitorId, setVisitorId] = useState<string | null>(null);

  useEffect(() => {
    let storedId = localStorage.getItem(VISITOR_SESSION_KEY);
    if (!storedId) {
      storedId = uuidv4();
      localStorage.setItem(VISITOR_SESSION_KEY, storedId);
    }
    setVisitorId(storedId);
  }, []);

  return { visitorId };
};

export const getSupportStatus = (): { isOnline: boolean; statusText: string } => {
  const now = new Date();
  const hours = now.getHours();
  // L'assistance est disponible tous les jours de 08h00 à 20h00
  const isOnline = hours >= 8 && hours < 20;

  return {
    isOnline,
    statusText: isOnline 
      ? 'En ligne' 
      : 'Hors ligne — laissez votre message, nous vous répondrons vite',
  };
};
