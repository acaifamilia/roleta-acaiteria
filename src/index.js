<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Painel Administrativo | Açaí da Família Castro</title>

<style>
*{box-sizing:border-box}

body{
  margin:0;
  font-family:Arial,sans-serif;
  background:linear-gradient(145deg,#170824,#35104f,#64258b);
  color:#fff;
  min-height:100vh;
  padding:20px;
}

main{max-width:1000px;margin:25px auto}

header{text-align:center;margin-bottom:30px}

header h1{font-size:29px;margin-bottom:8px}
header p{color:#e5d6f2;margin:0}

section{
  background:#fff;
  color:#35104f;
  padding:24px;
  border-radius:18px;
  margin-bottom:20px;
  box-shadow:0 8px 25px #0003;
}

h2{margin-top:0;font-size:21px}

input,button{
  width:100%;
  padding:14px;
  border-radius:10px;
  font-size:16px;
  margin:7px 0;
}

input{
  border:1px solid #d8cce1;
  outline:none;
}

input:focus{border-color:#762caf}

button{
  border:0;
  background:#68269a;
  color:white;
  font-weight:bold;
  cursor:pointer;
}

button:hover{background:#48156c}
button:disabled{opacity:.6;cursor:wait}

.escondido{display:none}

.mensagem{
  white-space:pre-wrap;
  font-weight:bold;
  line-height:1.6;
  overflow-wrap:anywhere;
}

.sucesso{color:#168044}
.erro{color:#c62828}

.codigo{
  background:#f1e7fa;
  padding:16px;
  border-radius:12px;
  text-align:center;
  font-size:22px;
  font-weight:bold;
  letter-spacing:2px;
  margin-top:12px;
  overflow-wrap:anywhere;
}

.grade{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:12px;
}

.card{
  background:#f5effa;
  padding:18px;
  border-radius:13px;
  text-align:center;
}

.card span{
  display:block;
  font-size:13px;
  color:#765c85;
  margin-bottom:8px;
}

.card strong{
  font-size:23px;
  overflow-wrap:anywhere;
}

.item{
  padding:15px 0;
  border-bottom:1px solid #eee;
  line-height:1.7;
  overflow-wrap:anywhere;
}

.item:last-child{border:0}

small{color:#735d7d}

.filtro{
  display:flex;
  gap:10px;
  align-items:center;
  flex-wrap:wrap;
}

.filtro input{flex:1;min-width:180px}
.filtro button{width:auto;min-width:150px}

@media(max-width:650px){
  body{padding:12px}
  section{padding:17px}
  .grade{grid-template-columns:1fr}
  header h1{font-size:24px}
  .filtro button{width:100%}
}
</style>
</head>

<body>
<main>

<header>
  <h1>🍧 Açaí da Família Castro</h1>
  <p>Painel de gerenciamento e controle de vendas</p>
</header>

<section id="login">
  <h2>🔐 Acesso administrativo</h2>
  <input id="senha" type="password" placeholder="Digite sua senha">
  <button id="botaoEntrar" onclick="entrar()">ENTRAR NO PAINEL</button>
  <p id="erroLogin" class="mensagem erro"></p>
</section>

<div id="painel" class="escondido">

<section>
  <h2>➕ Cadastrar cliente</h2>

  <input id="nome" placeholder="Nome do cliente">
  <input id="telefone" placeholder="Telefone / WhatsApp" type="tel">
  <input id="valor" placeholder="Valor da compra (ex.: 35,00)"
    inputmode="decimal">

  <button id="botaoCadastrar" onclick="cadastrar()">
    GERAR CÓDIGO E REGISTRAR VENDA
  </button>

  <p id="mensagem" class="mensagem"></p>
  <div id="codigoGerado"></div>
</section>

<section>
  <h2>📊 Relatório financeiro</h2>

  <div class="filtro">
    <input id="mes" type="month">
    <button onclick="carregarRelatorio()">CONSULTAR MÊS</button>
  </div>

  <div class="grade">
    <div class="card">
      <span>Faturamento registrado</span>
      <strong id="totalVendas">R$ 0,00</strong>
    </div>

    <div class="card">
      <span>Quantidade de vendas</span>
      <strong id="quantidadeVendas">0</strong>
    </div>

    <div class="card">
      <span>Clientes participantes</span>
      <strong id="quantidadeClientes">0</strong>
    </div>
  </div>

  <p id="mensagemRelatorio" class="mensagem"></p>
</section>

<section>
  <h2>🧾 Histórico de vendas</h2>
  <div id="historico">Selecione um mês para consultar.</div>
</section>

<section>
  <h2>📋 Clientes cadastrados</h2>
  <button onclick="carregarClientes()">ATUALIZAR CLIENTES</button>
  <div id="lista">Carregando...</div>
</section>

</div>
</main>

<script>
let token = "";

const moeda = new Intl.NumberFormat("pt-BR", {
  style:"currency",
  currency:"BRL"
});

function dinheiro(valor) {
  return moeda.format((Number(valor) || 0) / 100);
}

function converterCentavos(texto) {
  let valor = texto.trim()
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const numero = Number(valor);

  if (!Number.isFinite(numero) || numero <= 0) {
    return null;
  }

  const centavos = Math.round(numero * 100);

  if (!Number.isSafeInteger(centavos) || centavos <= 0) {
    return null;
  }

  return centavos;
}

async function requisicao(url, opcoes = {}) {
  opcoes.headers = {
    "Content-Type":"application/json",
    ...(opcoes.headers || {})
  };

  if(token) {
    opcoes.headers.Authorization = "Bearer " + token;
  }

  const resposta = await fetch(url, opcoes);

  let dados;

  try {
    dados = await resposta.json();
  } catch {
    throw new Error("Resposta inválida do servidor.");
  }

  if(!resposta.ok) {
    throw new Error(dados.erro || "Ocorreu um erro.");
  }

  return dados;
}

async function entrar() {
  const erro = document.getElementById("erroLogin");
  const botao = document.getElementById("botaoEntrar");

  erro.textContent = "Verificando acesso...";
  botao.disabled = true;

  try {
    const dados = await requisicao("/api/admin/login", {
      method:"POST",
      body:JSON.stringify({
        senha:document.getElementById("senha").value
      })
    });

    token = dados.token;

    document.getElementById("login").classList.add("escondido");
    document.getElementById("painel").classList.remove("escondido");

    carregarClientes();
    carregarRelatorio();

  } catch(e) {
    erro.textContent = e.message;
  } finally {
    botao.disabled = false;
  }
}

async function cadastrar() {
  const mensagem = document.getElementById("mensagem");
  const codigoGerado = document.getElementById("codigoGerado");
  const botao = document.getElementById("botaoCadastrar");

  const nome = document.getElementById("nome").value.trim();
  const telefone = document.getElementById("telefone").value.trim();
  const valorTexto = document.getElementById("valor").value;
  const valor_centavos = converterCentavos(valorTexto);

  codigoGerado.textContent = "";

  if(!nome || !telefone || valor_centavos === null) {
    mensagem.className = "mensagem erro";
    mensagem.textContent =
      "Preencha nome, telefone e um valor de compra válido.";
    return;
  }

  mensagem.className = "mensagem";
  mensagem.textContent = "Registrando cliente e gerando código...";
  botao.disabled = true;

  try {
    const dados = await requisicao("/api/admin/clientes", {
      method:"POST",
      body:JSON.stringify({
        nome,
        telefone,
        valor_centavos
      })
    });

    mensagem.className = "mensagem sucesso";
    mensagem.textContent =
      "✅ Cliente cadastrado e venda registrada com sucesso!\nValor: " +
      dinheiro(dados.valor_centavos);

    const codigo = document.createElement("div");
    codigo.className = "codigo";
    codigo.textContent = dados.codigo;
    codigoGerado.appendChild(codigo);

    document.getElementById("nome").value = "";
    document.getElementById("telefone").value = "";
    document.getElementById("valor").value = "";

    carregarClientes();
    carregarRelatorio();

  } catch(e) {
    mensagem.className = "mensagem erro";
    mensagem.textContent = "Erro: " + e.message;
  } finally {
    botao.disabled = false;
  }
}

async function carregarClientes() {
  const lista = document.getElementById("lista");
  lista.textContent = "Carregando clientes...";

  try {
    const clientes = await requisicao("/api/admin/clientes");

    lista.replaceChildren();

    if(!clientes.length) {
      lista.textContent = "Nenhum cliente cadastrado.";
      return;
    }

    clientes.forEach(cliente => {
      const item = document.createElement("div");
      item.className = "item";

      const nome = document.createElement("strong");
      nome.textContent = cliente.nome;

      const telefone = document.createElement("div");
      telefone.textContent = "Telefone: " + cliente.telefone;

      const codigo = document.createElement("div");
      codigo.textContent = "Código: " + (cliente.codigo || "Sem código");

      const status = document.createElement("small");
      status.textContent = cliente.usado
        ? " • Código já utilizado"
        : " • Código disponível";

      item.append(nome, telefone, codigo, status);

      if(cliente.premio) {
        const premio = document.createElement("div");
        premio.textContent = "Prêmio: " + cliente.premio;
        item.appendChild(premio);
      }

      lista.appendChild(item);
    });

  } catch(e) {
    lista.textContent = "Erro ao carregar clientes: " + e.message;
  }
}

function formatarData(data) {
  if(!data) return "Data não informada";

  const partes = data.split(" ");
  const dia = partes[0].split("-");

  if(dia.length !== 3) return data;

  return dia[2] + "/" + dia[1] + "/" + dia[0] +
    (partes[1] ? " às " + partes[1] : "");
}

async function carregarRelatorio() {
  const mes = document.getElementById("mes").value;
  const mensagem = document.getElementById("mensagemRelatorio");
  const historico = document.getElementById("historico");

  if(!mes) {
    mensagem.textContent = "Selecione um mês.";
    return;
  }

  mensagem.textContent = "Consultando relatório...";
  historico.textContent = "Carregando vendas...";

  try {
    const resumo = await requisicao(
      "/api/admin/resumo?mes=" + encodeURIComponent(mes)
    );

    document.getElementById("totalVendas").textContent =
      dinheiro(resumo.total_centavos);

    document.getElementById("quantidadeVendas").textContent =
      resumo.total_vendas || 0;

    document.getElementById("quantidadeClientes").textContent =
      resumo.total_clientes || 0;

    const vendas = await requisicao(
      "/api/admin/vendas?mes=" + encodeURIComponent(mes)
    );

    historico.replaceChildren();

    if(!vendas.length) {
      historico.textContent = "Nenhuma venda registrada neste mês.";
    } else {
      vendas.forEach(venda => {
        const item = document.createElement("div");
        item.className = "item";

        const nome = document.createElement("strong");
        nome.textContent = venda.nome;

        const valor = document.createElement("div");
        valor.textContent = "Valor: " + dinheiro(venda.valor_centavos);

        const telefone = document.createElement("div");
        telefone.textContent = "Telefone: " + venda.telefone;

        const data = document.createElement("small");
        data.textContent = formatarData(venda.data_venda);

        item.append(nome, valor, telefone, data);
        historico.appendChild(item);
      });
    }

    mensagem.textContent = "Relatório atualizado com sucesso.";

  } catch(e) {
    mensagem.textContent = "Erro: " + e.message;
    historico.textContent = "Não foi possível carregar o histórico.";
  }
}

function iniciarMes() {
  const agora = new Date();
  const mes = agora.getFullYear() + "-" +
    String(agora.getMonth() + 1).padStart(2, "0");

  document.getElementById("mes").value = mes;
}

iniciarMes();
</script>

</body>
</html>
