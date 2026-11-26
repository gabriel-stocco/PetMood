import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installButtonMotion } from './utils/buttonMotion';

installButtonMotion();

createRoot(document.getElementById('root')!).render(<App />);
