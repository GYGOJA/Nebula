import { createBrowserRouter, Navigate } from 'react-router-dom'

import AuthLayout from '@/components/AuthLayout'
import AppLayout from '@/components/AppLayout'

import Login from '@/pages/Login'
import RegisterEmail from '@/pages/RegisterEmail'
import RegisterVerify from '@/pages/RegisterVerify'
import RegisterProfile from '@/pages/RegisterProfile'
import RecoverPassword from '@/pages/RecoverPassword'
import NotFound from '@/pages/NotFound'
import Invite from '@/pages/Invite'

import Home from '@/pages/Home'
import Chat from '@/pages/Chat'
import Friends from '@/pages/Friends'
import Search from '@/pages/Search'
import Settings from '@/pages/Settings'
import Profile from '@/pages/Profile'
import UserProfile from '@/pages/UserProfile'

import {
    Spaces as SpacesList,
    SpaceDetails as SpaceDetail,
} from '@/pages/Spaces'

import CreateSpace from '@/pages/CreateSpace'

import {
    DmList,
    DmChat,
} from '@/pages/DirectMessages'

import VoiceRoom from '@/pages/VoiceRoom'

export const router = createBrowserRouter([
    {
        path: '/',
        element: <Navigate to="/app" replace />,
    },
    {
        element: <AuthLayout />,
        children: [
            { path: '/login', element: <Login /> },
            { path: '/register', element: <RegisterEmail /> },
            { path: '/register/verify', element: <RegisterVerify /> },
            { path: '/register/profile', element: <RegisterProfile /> },
            { path: '/recover', element: <RecoverPassword /> },
        ],
    },
    {
        path: '/invite/:code',
        element: <Invite />,
    },
    {
        path: '/app',
        element: <AppLayout />,
        children: [
            { index: true, element: <Home /> },
            { path: 'home', element: <Navigate to="/app" replace /> },
            { path: 'channels/:channelId', element: <Chat /> },
            { path: 'friends', element: <Friends /> },
            { path: 'search', element: <Search /> },
            { path: 'settings', element: <Settings /> },
            { path: 'profile', element: <Profile /> },
            { path: 'users/:userId', element: <UserProfile /> },
            { path: 'spaces', element: <SpacesList /> },
            { path: 'spaces/new', element: <CreateSpace /> },
            { path: 'spaces/:spaceId', element: <SpaceDetail /> },
            { path: 'dm', element: <DmList /> },
            { path: 'dm/:userId', element: <DmChat /> },
            { path: 'voice/:roomId', element: <VoiceRoom /> },
            { path: 'voice', element: <Navigate to="/app" replace /> },
        ],
    },
    {
        path: '*',
        element: <NotFound />,
    },
])