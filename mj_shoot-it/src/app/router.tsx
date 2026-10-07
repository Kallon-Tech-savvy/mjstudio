import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";

type AppRouterProps = {
  home: ReactNode;
  photographerLogin: ReactNode;
  photographerDashboard: ReactNode;
  photographerGalleries: ReactNode;
  photographerGalleryDetail: ReactNode;
  clientAccess: ReactNode;
  clientGallery: ReactNode;
  clientSelection: ReactNode;
  clientCompletion: ReactNode;
  clientDelivery: ReactNode;
};

export default function AppRouter({
  home,
  photographerLogin,
  photographerDashboard,
  photographerGalleries,
  photographerGalleryDetail,
  clientAccess,
  clientGallery,
  clientSelection,
  clientCompletion,
  clientDelivery,
}: AppRouterProps) {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={home} />
        <Route path="/photographer/login" element={photographerLogin} />
        <Route path="/photographer/dashboard" element={photographerDashboard} />
        <Route path="/photographer/galleries" element={photographerGalleries} />
        <Route path="/photographer/galleries/:galleryId" element={photographerGalleryDetail} />
        <Route path="/client/access" element={clientAccess} />
        <Route path="/client/gallery/:galleryId" element={clientGallery} />
        <Route path="/client/gallery/:galleryId/selection" element={clientSelection} />
        <Route path="/client/gallery/:galleryId/complete" element={clientCompletion} />
        <Route path="/client/gallery/:galleryId/delivery" element={clientDelivery} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
