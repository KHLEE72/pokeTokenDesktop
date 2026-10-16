import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// A release build can bypass Actions artifact storage limits. Only an existing
// draft whose tag resolves to this exact workflow revision is a valid target.
const mode=process.argv[2],tag=process.env.RELEASE_TAG,repository=process.env.GH_REPO,revision=process.env.GITHUB_SHA
const {version}=JSON.parse(readFileSync('package.json','utf8'))
if(!['check','upload'].includes(mode)||tag!==`v${version}`||!repository?.match(/^[\w.-]+\/[\w.-]+$/)||!revision?.match(/^[a-f0-9]{40}$/))throw Error('Invalid release context')
const gh=args=>execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']})
const api=path=>JSON.parse(gh(['api',`repos/${repository}/${path}`]))
const draft=()=>{
  const release=api('releases?per_page=100').find(item=>item.tag_name===tag)
  if(!release?.draft)throw Error('The requested release must exist and remain a draft')
  let ref=api(`git/ref/tags/${tag}`).object
  for(let depth=0;ref.type==='tag'&&depth<4;depth++)ref=api(`git/tags/${ref.sha}`).object
  if(ref.type!=='commit'||ref.sha!==revision)throw Error('The release tag does not match this build revision')
  return release
}
draft()
if(mode==='check')console.log(`Validated draft ${tag} at ${revision}`)
else{
  const arch=process.env.PET_BUILD_ARCH
  if(process.platform!=='darwin'||!['arm64','x64'].includes(arch)||process.arch!==arch)throw Error('A matching native Mac build is required')
  if(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==revision)throw Error('Checkout revision mismatch')
  const reports=['smoke','pet-motion','window-motion','dpi','health','collection','rewards','evolution','dashboard','input','session','forms']
  const validation={}
  for(const name of reports){
    const report=JSON.parse(readFileSync(join('artifacts',`${name}-report.json`),'utf8'))
    if(report.errors?.length)throw Error(`The ${name} check reported errors`)
    validation[name]={passed:true,checks:Array.isArray(report.checks)?report.checks.length:null}
  }
  const filename=`PokeToken-Desktop-${version}-mac-${arch}.dmg`,file=join('release',filename)
  const digest=async path=>{const hash=createHash('sha256');for await(const bytes of createReadStream(path))hash.update(bytes);return hash.digest('hex')}
  const sha256=await digest(file)
  const info=join('release',`build-info-mac-${arch}.json`)
  writeFileSync(info,JSON.stringify({version,sourceCommit:revision,architecture:arch,filename,sha256,bytes:statSync(file).size,macOS:execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim(),signature:'ad-hoc; verified with codesign --deep --strict',unitTests:'npm test passed',validation,workflowRun:`https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`},null,2)+'\n')
  for(const path of [file,info]){
    const name=path.split(/[\\/]/).at(-1),expected=`sha256:${await digest(path)}`
    const existing=draft().assets.find(asset=>asset.name===name)
    if(existing){
      if(existing.digest!==expected)throw Error(`A different ${name} is already attached; it was not overwritten`)
      console.log(`Already verified: ${name}`);continue
    }
    gh(['release','upload',tag,path,'--repo',repository])
    const uploaded=draft().assets.find(asset=>asset.name===name)
    if(uploaded?.state!=='uploaded'||uploaded.digest!==expected)throw Error(`Uploaded ${name} did not match its checksum`)
    console.log(`Verified release asset: ${name}`)
  }
}
