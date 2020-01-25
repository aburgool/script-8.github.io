import React, { Component, Fragment } from 'react'
import { connect } from 'react-redux'
import _ from 'lodash'
import screenTypes from '../iframe/src/utils/screenTypes.js'
import throwError from '../utils/throwError.js'
import frecency from '../utils/frecency.js'
import actions, { setVisibility, unshelveCassette } from '../actions/actions.js'
import ShelfCassettes from '../components/ShelfCassettes.js'

const mapStateToProps = ({ gist, token, shelving }) => ({
  gist,
  token,
  shelving
})

const mapDispatchToProps = dispatch => ({
  unshelveCassette: ({ token, gistId }) =>
    dispatch(unshelveCassette({ token, gistId })),
  setScreen: screen => dispatch(actions.setScreen(screen)),
  setVisibility: ({ token, gistId, isPrivate }) =>
    dispatch(setVisibility({ token, gistId, isPrivate }))
})

class Shelf extends Component {
  constructor(props) {
    super(props)
    this.fetchCassettes = this.fetchCassettes.bind(this)
    this.makeShelfCassettes = this.makeShelfCassettes.bind(this)
    this.handleOnClick = this.handleOnClick.bind(this)
    this.handleOnShowAllClick = this.handleOnShowAllClick.bind(this)
    this.handleSetVisibility = this.handleSetVisibility.bind(this)
    this.handleRemove = this.handleRemove.bind(this)
    this.state = {
      fetching: true,
      popularCassettes: [],
      recentCassettes: []
    }
  }

  componentDidMount() {
    this._isMounted = true
    this.fetchCassettes()
  }

  componentWillUnmount() {
    this._isMounted = false
    const { search } = window.location
    const params = new window.URLSearchParams(search)
    const gameId = params.get('id')
    const shelfUser = params.get('shelf')
    if (!gameId && shelfUser) {
      window.history.pushState(null, null, '/')
    }
  }

  fetchCassettes() {
    const { token } = this.props
    const currentLogin = _.get(token, 'user.login', null)

    const { search } = window.location
    const params = new window.URLSearchParams(search)
    const shelfUser = params.get('shelf')

    // If querystring doesn't have `shelf` and we are logged in,
    // load our cassettes.

    if (token.value && !shelfUser) {
      window
        .fetch(`${process.env.REACT_APP_NOW}/private-cassettes`, {
          method: 'POST',
          body: JSON.stringify({
            token: token.value
          })
        })
        .then(
          response => response.json(),
          error =>
            throwError({
              error,
              message: `Could not request cassettes.`
            })
        )
        .then(value => {
          const yourPrivateCassettes = _(value)
            .sortBy(cassette => +cassette.updated)
            .reverse()
            .value()

          if (this._isMounted) {
            this.setState({
              yourPrivateCassettes,
              fetching: false
            })
          }
        })
    } else {
      if (this._isMounted) {
        this.setState({
          yourPrivateCassettes: []
        })
      }
    }

    window
      .fetch(`${process.env.REACT_APP_NOW}/cassettes`)
      .then(
        response => response.json(),
        error =>
          throwError({
            error,
            message: `Could not request cassettes.`
          })
      )
      .then(value => {
        const cassettes = value.map(cassette => ({
          ...cassette,
          counter: +cassette.counter || 0
        }))

        const popularCassettes = _(cassettes)
          .map(cassette => ({
            ...cassette,
            score: frecency(cassette.visits)
          }))
          .sortBy(cassette => cassette.score)
          .reverse()
          .value()

        const recentCassettes = _(cassettes)
          .sortBy(cassette => +cassette.updated)
          .reverse()
          .value()

        const yourPublicCassettes = currentLogin
          ? recentCassettes.filter(cassette => cassette.user === currentLogin)
          : []

        if (this._isMounted) {
          this.setState({
            popularCassettes: popularCassettes.filter(d => !d.isFork),
            recentCassettes: recentCassettes.filter(d => !d.isFork),
            yourPublicCassettes,
            fetching: false
          })
        }
      })
  }

  componentDidUpdate(prevProps) {
    if (
      (prevProps.shelving && !this.props.shelving) ||
      prevProps.token !== this.props.token
    ) {
      this.setState({
        fetching: true
      })
      this.fetchCassettes()
    }
  }

  handleOnShowAllClick() {
    window.history.pushState(null, null, '/')
    this.setState({
      fetching: true
    })
    this.fetchCassettes()
  }

  handleOnClick({ e, id }) {
    const { gist, setScreen } = this.props
    if (id === _.get(gist, 'data.id')) {
      e.preventDefault()
      setScreen(screenTypes.RUN)
    }
  }

  handleSetVisibility({ gistId, isPrivate }) {
    const { token, setVisibility } = this.props
    setVisibility({ token, gistId, isPrivate })
  }

  handleRemove({ gistId }) {
    const { token, unshelveCassette } = this.props
    if (
      window.confirm(
        'Do you really want to remove this cassette from the shelf?'
      )
    ) {
      unshelveCassette({ gistId, token })
    }
  }

  // NOTE: this is currently not in use
  makeShelfCassettes({ cassettes, title, tokenLogin }) {
    return (
      <ShelfCassettes
        handleSetVisibility={this.handleSetVisibility}
        handleRemove={this.handleRemove}
        tokenLogin={tokenLogin}
        handleOnClick={this.handleOnClick}
        cassettes={cassettes}
        title={title}
      />
    )
  }

  render() {
    const {
      popularCassettes,
      recentCassettes,
      yourPublicCassettes,
      yourPrivateCassettes,
      fetching
    } = this.state

    const tokenLogin = _.get(this.props, 'token.user.login', null)

    const { search } = window.location
    const params = new window.URLSearchParams(search)
    const shelfUser = (params.get('shelf') || '').toLowerCase()

    const userPublicCassettes = recentCassettes.filter(
      d => d.user.toLowerCase() === shelfUser
    )

    return (
      <div className="Shelf">
        <div className="main">
          {fetching ? (
            <p className="loading">loading cassettes...</p>
          ) : shelfUser ? (
            userPublicCassettes.length ? (
              <ShelfCassettes
                handleSetVisibility={this.handleSetVisibility}
                handleRemove={this.handleRemove}
                tokenLogin={tokenLogin}
                handleOnClick={this.handleOnClick}
                cassettes={userPublicCassettes}
                title={`${shelfUser}'s ${
                  tokenLogin && shelfUser === tokenLogin.toLowerCase()
                    ? 'public'
                    : ''
                } cassettes`}
                step={20}
                showAllButton={true}
                handleOnShowAllClick={this.handleOnShowAllClick}
              />
            ) : (
              <p className="loading">no cassettes found</p>
            )
          ) : (
            <Fragment>
              {yourPrivateCassettes && yourPrivateCassettes.length ? (
                <ShelfCassettes
                  handleSetVisibility={this.handleSetVisibility}
                  handleRemove={this.handleRemove}
                  tokenLogin={tokenLogin}
                  handleOnClick={this.handleOnClick}
                  cassettes={yourPrivateCassettes}
                  title="Your private cassettes"
                />
              ) : null}
              {yourPublicCassettes && yourPublicCassettes.length ? (
                <ShelfCassettes
                  handleSetVisibility={this.handleSetVisibility}
                  handleRemove={this.handleRemove}
                  tokenLogin={tokenLogin}
                  handleOnClick={this.handleOnClick}
                  cassettes={yourPublicCassettes}
                  title="Your public cassettes"
                />
              ) : null}
              <ShelfCassettes
                handleSetVisibility={this.handleSetVisibility}
                handleRemove={this.handleRemove}
                tokenLogin={tokenLogin}
                handleOnClick={this.handleOnClick}
                cassettes={popularCassettes}
                title="Popular cassettes"
              />
              <ShelfCassettes
                handleSetVisibility={this.handleSetVisibility}
                handleRemove={this.handleRemove}
                tokenLogin={tokenLogin}
                handleOnClick={this.handleOnClick}
                cassettes={recentCassettes}
                title="Recent cassettes"
              />
            </Fragment>
          )}
        </div>
      </div>
    )
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(Shelf)
