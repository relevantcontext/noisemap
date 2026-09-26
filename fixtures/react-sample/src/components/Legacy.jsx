import React from 'react';

export default class Legacy extends React.Component {
  constructor(props) {
    super(props);
    this.state = { open: false };
  }

  componentDidMount() {
    window.addEventListener('resize', this.onResize);
  }

  onResize = () => {
    this.setState({ open: false });
  };

  toggle() {
    this.setState({ open: !this.state.open });
  }

  render() {
    const { open } = this.state;
    return (
      <section>
        <button onClick={this.toggle}>Toggle</button>
        {open ? <p>Now you see me</p> : null}
      </section>
    );
  }
}
