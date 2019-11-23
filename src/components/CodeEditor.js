// actions.updateContent is used in three places:
// - in CodeEditor, on code mirror change
// - in Tutorial, if slide has game,
//    if we're not on code, updateContent is called as is
//    if we are on code, updateContent is called with the prefix
import { parse } from 'acorn'
import { simple as walk } from 'acorn-walk'
import React, { Component } from 'react'
import { isNil } from 'lodash'
import get from 'lodash/get'
import includes from 'lodash/includes'
import setupLinter from '../utils/setupLinter.js'
import commands from '../utils/commands.js'
import blankTemplate from '../iframe/src/blankTemplate.js'
import { getActive } from '../reducers/game.js'
import lessons from '../utils/lessons.json'

const { platform } = window.navigator

class CodeEditor extends Component {
  constructor(props) {
    super(props)

    this.sliderMark = null
    this.hoverMark = null
    this.setContents = this.setContents.bind(this)
    this.handleSlider = this.handleSlider.bind(this)
    this.activateSlider = this.activateSlider.bind(this)
    this.hideSlider = this.hideSlider.bind(this)
    this.highlightText = this.highlightText.bind(this)
    this.mouseMove = this.mouseMove.bind(this)
  }

  componentDidMount() {
    setupLinter()
    const activeGame = getActive(this.props.game)
    this.codeMirror = window.CodeMirror(this._editor, {
      value: activeGame.text || '',
      mode: 'javascript',
      theme: 'nyx8',
      lint: true,
      lineNumbers: true,
      tabSize: 2,
      cursorBlinkRate: 0,
      scrollbarStyle: null,
      extraKeys: {
        Tab: commands.tab,
        'Cmd-/': commands.comment,
        'Ctrl-/': commands.comment,
        'Alt-F': cm => commands.format(cm, this.setContents),
        Esc: 'clearSearch'
      }
    })

    const docHistory = get(this.props.docHistories, `[${activeGame.key}]`, null)

    if (docHistory) {
      this.codeMirror.getDoc().setHistory(docHistory)
    } else {
      this.codeMirror.getDoc().clearHistory()
    }

    this.codeMirror.on('change', cm => {
      const content = cm.getValue()
      document.querySelector('#highlighter-box').classList.add('hide')
      this.props.updateContent(content)
    })

    this.codeMirror.on('keydown', (cm, e) => {
      if (includes(platform, 'Mac')) {
        if (e.key === 'Meta') {
          this.activateSlider()
        }
      } else {
        if (e.key === 'Shift') {
          this.activateSlider()
        }
      }
    })

    // Add this eventlistener to window.
    window.addEventListener('keyup', this.hideSlider)

    // If found, restore scroll data.
    const { scrollData } = activeGame
    if (scrollData) {
      this.codeMirror.scrollTo(scrollData.left || 0, scrollData.top || 0)
      this.codeMirror.setCursor(scrollData.cursorPosition)
    }

    // Give editor focus.
    this.codeMirror.focus()
  }

  hideSlider() {
    this.sliderMark && this.sliderMark.clear()
    this._slider.classList.add('hide')
  }

  highlightText(range) {
    const lines = range.split('-').map(d => +d)
    const firstLine = lines[0]
    const lastLine = lines[lines.length - 1]
    const cmLines = lines.map(d => this.codeMirror.getLine(d))

    const whiteSpaces = cmLines[0].search(/\S/)

    // Calculate the width.
    const width =
      (Math.max(...cmLines.map(d => d.length)) - whiteSpaces + 1) *
      this.codeMirror.defaultCharWidth()

    // Calculate the height.
    const height =
      this.codeMirror.defaultTextHeight() * (1 + lastLine - firstLine)

    document.querySelector('#highlighter-box').classList.remove('hide')
    this.codeMirror.addWidget(
      { line: firstLine, ch: whiteSpaces },
      document.querySelector('#highlighter-box'),
      false
    )

    this._highlighterBox.style.width = `${width + 8}px`
    this._highlighterBox.style.height = `${height + 6}px`

    this.codeMirror.scrollIntoView({ line: lastLine, ch: 0 }, 40)
  }

  activateSlider() {
    // If the cursor is on a number,
    // reset and show the slider.

    // Get cursor.
    const cursor = this.codeMirror.getCursor()

    // Get token for this position.
    const token = this.codeMirror.getTokenAt({
      ...cursor,
      ch: cursor.ch + 1
    })

    // If it's a number,
    if (token && token.type === 'number') {
      // clear out the previous mark,
      this.sliderMark && this.sliderMark.clear()

      // and mark this token.
      this.sliderMark = this.codeMirror.markText(
        {
          line: cursor.line,
          ch: token.start
        },
        {
          line: cursor.line,
          ch: token.end
        },
        {
          className: 'slider-token'
        }
      )

      // get the token's middle point coords.
      const middleCoords = this.codeMirror.charCoords({
        line: cursor.line,
        ch: token.start
      })

      // Get the wrapper rect.
      const wrapperRect = this._wrapper.getBoundingClientRect()

      // Save token.
      const value = token.string

      const valueNumber = +value

      if (valueNumber >= -127 && valueNumber <= 127) {
        this._slider.min = -127
        this._slider.max = 127
        this._slider.value = valueNumber
      } else {
        this._slider.min = -valueNumber * 2
        this._slider.max = valueNumber * 2
        this._slider.value = valueNumber
      }

      // Position slider centered above token.
      this._slider.style.left = `${middleCoords.left -
        wrapperRect.left +
        (value.length * this.codeMirror.defaultCharWidth()) / 2}px`
      this._slider.style.top = `${middleCoords.top -
        wrapperRect.top -
        this.codeMirror.defaultTextHeight()}px`

      // Show slider.
      this._slider.classList.remove('hide')
    }
  }

  handleSlider(e) {
    // Get mark positions.
    const { from, to } = this.sliderMark.find()

    // Calculate new token.
    const newToken = e.target.value.toString()

    // Change token content.
    this.codeMirror.replaceRange(newToken, from, to)

    // Re-select token.
    this.sliderMark = this.codeMirror.markText(
      from,
      {
        ...from,
        ch: from.ch + newToken.length
      },
      {
        className: 'slider-token'
      }
    )
  }

  setContents(value) {
    this.codeMirror.setValue(value)
    this.codeMirror.refresh()
  }

  componentWillReceiveProps(nextProps) {
    // If the incoming game is the empty game code,
    if (nextProps.game[0].text === 'SCRIPT-8 NEW') {
      // set CodeMirror's value to the blank template,
      this.setContents(blankTemplate)
      // and clear the doc history.
      this.codeMirror.getDoc().clearHistory()
    } else if (
      // If the incoming game is a lesson,
      nextProps.game[0].text.startsWith('SCRIPT-8 LESSON')
    ) {
      // set the lesson,
      this.setContents(nextProps.game[0].text.replace('SCRIPT-8 LESSON', ''))

      // and highlight lines if required.
      const { tutorial } = nextProps
      if (tutorial) {
        const lesson = lessons[tutorial.lessonIndex]
        const { slides } = lesson
        const slide = slides[tutorial.slideIndex]
        if (slide && slide.linesToHighlight) {
          this._highlighterBox.classList.remove('hide')
          this.highlightText(slide.linesToHighlight)
        }
      }
    } else if (
      // If the incoming tab is different than this one,
      // we are about to switch tabs.
      getActive(this.props.game).key !== getActive(nextProps.game).key
    ) {
      // Save current doc's history.
      this.props.updateHistory({
        index: getActive(this.props.game).key,
        history: this.codeMirror.getDoc().getHistory()
      })

      // Save current scrollData.
      const oldScrollInfo = this.codeMirror.getScrollInfo()
      const oldCursorPosition = this.codeMirror.getCursor()
      this.props.setScrollData({
        scrollData: {
          top: oldScrollInfo.top,
          left: oldScrollInfo.left,
          cursorPosition: oldCursorPosition
        },
        tab: getActive(this.props.game).key
      })

      // Set codemirror contents to new tab.
      this.setContents(getActive(nextProps.game).text || '')

      // Try getting new tab's history.
      const docHistory = get(
        this.props.docHistories,
        `[${getActive(nextProps.game).key}]`,
        null
      )

      // Try setting new tab's history.
      if (docHistory) {
        this.codeMirror.getDoc().setHistory(docHistory)
      } else {
        this.codeMirror.getDoc().clearHistory()
      }

      // Try setting new tab's scrollData.
      const { scrollData } = getActive(nextProps.game)
      if (scrollData) {
        this.codeMirror.scrollTo(scrollData.left || 0, scrollData.top || 0)
        this.codeMirror.setCursor(scrollData.cursorPosition)
      }

      // Give editor focus.
      this.codeMirror.focus()
    }

    if (
      JSON.stringify(nextProps.errorLine) !==
      JSON.stringify(this.props.errorLine)
    ) {
      if (!isNil(nextProps.errorLine)) {
        // We'll use this to store the setTimeout id.
        let id

        // This counter will prevent the setTimeout running indefinitely.
        let counter

        // Function to check if codemirror has active game loaded.
        const isReady = () =>
          this.codeMirror.getValue() === getActive(this.props.game).text

        // Function to highlight the line.
        const highlight = () => {
          this.highlightText(nextProps.errorLine.line.toString())
        }

        // Function that checks if we're ready, and if so, stops the interval,
        // and highlights the text.
        const checkFunction = () => {
          if (isReady()) {
            clearInterval(id)
            highlight()
          } else if (counter >= 7) {
            clearInterval(id)
          }
          counter++
        }

        // Now we can begin.
        // If we're already ready,
        if (isReady()) {
          // just highlight.
          highlight()
        } else {
          // Otherwise,
          // reset the counter variable,
          counter = 0
          // and start checking.
          id = setInterval(checkFunction, 250)
        }
      }
    }
  }

  // Track current mouse position in the code
  mouseMove(e) {
    let tab = getActive(this.props.game)
    let setCallUnderMouse = (node) => {
      this.props.setCallUnderMouse({ tab: tab.key, callUnderMouse: node })
    }
    let clearCallUnderMouse = () => {
      this.props.clearCallUnderMouse({ tab: tab.key })
    }

    // We only want this to show up if the user is holding control. Otherwise selection and cursor position can get
    // confusing.
    if (e.ctrlKey) {
      // Lookup the text position of the mouse
      let mousePos = this.codeMirror.coordsChar({ left: e.pageX, top: e.pageY });
      if (!mousePos.outside) {
        let smallestNode = null
        let smallestSize = Infinity
        try {
          // Use Acorn to walk over the parsed code looking for each call expression. If the mouse is currently inside
          // the call expression text bounds, and is smaller than the previously smallest node, then store it away
          walk(parse(tab.text, {locations: true}), {
            // Call expression is used because it is pretty consistent.
            // https://github.com/estree/estree/blob/master/es5.md#callexpression
            CallExpression(node) {
              // If the mouse is in bounds, then continue to checking node size
              if (!mousePos.outside &&
                  mousePos.line + 1 >= node.loc.start.line &&
                  mousePos.line + 1 <= node.loc.end.line &&
                  mousePos.ch >= node.loc.start.column &&
                  mousePos.ch <= node.loc.end.column) {
                let nodeSize = node.end - node.start
                if (!smallestNode || nodeSize < smallestSize) {
                  smallestNode = node
                  smallestSize = nodeSize
                }
              }
            }
          })
        } catch { }

        // If a CallExpression node was found, highlight it to indicate to the user what is going on
        this.hoverMark && this.hoverMark.clear()
        if (smallestNode) {
          // and mark this expression.
          this.hoverMark = this.codeMirror.markText(
            {
              line: smallestNode.loc.start.line - 1,
              ch: smallestNode.loc.start.column
            },
            {
              line: smallestNode.loc.end.line - 1,
              ch: smallestNode.loc.end.column
            },
            {
              className: 'slider-token'
            }
          )
        }

        // Store the smallest node in the redux store
        setCallUnderMouse(smallestNode)
      } else {
        clearCallUnderMouse()
      }
    } else {
      clearCallUnderMouse()
      this.hoverMark && this.hoverMark.clear()
    }
  }

  componentWillUnmount() {
    window.removeEventListener('keyup', this.hideSlider)
    const activeGame = getActive(this.props.game)
    const scrollInfo = this.codeMirror.getScrollInfo()
    const cursorPosition = this.codeMirror.getCursor()
    const scrollData = {
      top: scrollInfo.top,
      left: scrollInfo.left,
      cursorPosition
    }
    this.props.setScrollData({ scrollData, tab: activeGame.key })
    this.props.updateHistory({
      index: activeGame.key,
      history: this.codeMirror.getDoc().getHistory()
    })
  }

  shouldComponentUpdate() {
    return false
  }

  render() {
    return (
      <div className="CodeEditor" onMouseMove={this.mouseMove}>
        <div
          className="wrapper"
          ref={_wrapper => {
            this._wrapper = _wrapper
          }}
        >
          <div
            className="_editor"
            ref={_editor => {
              this._editor = _editor
            }}
          />
          <input
            type="range"
            className="slider hide"
            step={1}
            ref={_slider => {
              this._slider = _slider
            }}
            onInput={this.handleSlider}
          />
          <div
            id="highlighter-box"
            ref={_highlighterBox => {
              this._highlighterBox = _highlighterBox
            }}
          />
        </div>
      </div>
    )
  }
}

export default CodeEditor
