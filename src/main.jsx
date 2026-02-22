import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ReactDOM from 'react-dom';
import { BrowserRouter } from 'react-router-dom';
import './index.css'
import App from './App.jsx'

import { Amplify} from 'aws-amplify';


Amplify.configure({

  Auth: {
    Cognito: {
      identityPoolId: "us-east-1:ef45dbd6-12b9-4a8a-849a-6ac35b158778",
      userPoolId: "us-east-1_W0IaBru9e",
      userPoolClientId: "37udumbt9e7dtplc9mtpsggg4a",

      mandatorySignIn: false,
      allowGuestAccess: false,
    }
  },
  Storage: {
    S3: {
    bucket: "dsoutrecord",
    region: "us-east-1",
    }
  }
});


createRoot(document.getElementById('root')).render(
  <StrictMode>
  <BrowserRouter>
    <App />
  </BrowserRouter>,
  </StrictMode>,
)
