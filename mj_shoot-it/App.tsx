import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState, type FormEvent } from "react";
import {
  createDownload,
  createGallery,
  createGalleryAccess,
  createGalleryFeedback,
  createPhotoFeedback,
  getClientGallery,
  getGallery,
  getPhotographerMe,
  getStudioSummary,
  listClients,
  listGalleryPhotos,
  listGalleries,
  listClientPhotos,
  photographerLogin,
  photographerLogout,
  setSelection,
  verifyClientAccess,
  type ClientRecord,
  type GalleryRecord,
  type PhotoRecord,
  type PhotographerUser,
} from "@/lib/api";

import ClientGallery from "@/pages/ClientGallery";
import ClientAccess from "@/pages/ClientAccess"
import GalleryDetail from "@/pages/GalleryDetail";
import Dashboard from "@/pages/Dashboard";
import Gallery from "@/pages/Gallery"
import Login from "@/pages/Login";

import Hero from './src/components/Hero';
import {Card} from './src/components/Card'


function HomePage() {
  return (
    <main className="page-shell landing-shell">
      <Hero />

      <Card>
        <h1>Photographer</h1>
      </Card>
    </main>
  );
}


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/photographer/login" element={<Login />} />
        <Route path="/photographer/dashboard" element={<Dashboard />} />
        <Route path="/photographer/galleries" element={<Gallery />} />
        <Route path="/photographer/galleries/:galleryId" element={<GalleryDetail />} />
        <Route path="/client/access" element={<ClientAccess />} />
        <Route path="/client/gallery/:galleryId" element={<ClientGallery />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
