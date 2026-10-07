import {Link} from 'react-router-dom'

export default function Hero(){
    return (
        <section className="panel hero-panel">
        <p className="eyebrow">MJ Studio</p>
        <h1>Fresh moment, Beautiful experience</h1>
        <p className="lead">
          Thoughtful portraits, quiet stories, and the work we love to keep close.
        </p>

        <div className="cta-row">
          <Link to="/photographer/login" className="primary-button">
            login
          </Link>
          <Link to="/client/access" className="secondary-button">
            Client access
          </Link>
        </div>
      </section>
    )
}