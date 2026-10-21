import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream,readFileSync,writeFileSync,statSync } from 'node:fs'
import { join } from 'node:path'
const mode=process.argv[2],version=JSON.parse(readFileSync('package.json','utf8')).version,tag=process.env.RELEASE_TAG,repository=process.env.GITHUB_REPOSITORY,revision=process.env.GITHUB_SHA
if(!['check','upload'].includes(mode)||tag!==`v${version}`||!repository?.match(/^[\w.-]+\/[\w.-]+$/)||!revision?.match(/^[a-f0-9]{40}$/))throw Error('Invalid release context')
const gh=args=>execFileSync('gh',args,{encoding:'utf8',windowsHide:true})
const api=path=>JSON.parse(gh(['api',`repos/${repository}/${path}`]))
function destination(){
 const release=api('releases?per_page=100').find(item=>item.tag_name===tag)
 if(!release?.draft)throw Error('The destination release must exist and remain a draft')
 if(Boolean(release.prerelease)!==version.includes('-'))throw Error('The release prerelease flag must match the package version')
 let ref=api(`git/ref/tags/${tag}`).object
 if(ref.type==='tag')ref=api(`git/tags/${ref.sha}`).object
 if(ref.type!=='commit'||ref.sha!==revision)throw Error('The release tag does not match this build revision')
 return release
}
destination()
if(mode==='upload'){
 const files=[`PokeToken-Desktop-${version}-Setup-x64.exe`,`PokeToken-Desktop-${version}-Setup-x64.exe.blockmap`,`PokeToken-Desktop-${version}-win-x64.exe`]
 const manifest='latest.yml',text=readFileSync(join('release',manifest),'utf8')
 const digest=async(path,algorithm='sha256',encoding='hex')=>{const hash=createHash(algorithm);for await(const bytes of createReadStream(path))hash.update(bytes);return hash.digest(encoding)}
 if(!text.includes(`version: ${version}`)||!text.includes(`url: ${files[0]}`)||!text.includes(`sha512: ${await digest(join('release',files[0]),'sha512','base64')}`))throw Error('Update manifest does not match the installer')
 const validation={}
 for(const name of ['league','forms','i18n-smoke-native','dashboard','evolution','portable','updater-download','portable-update']){
  const file=name==='i18n-smoke-native'?`artifacts/${name}.json`:`artifacts/${name}-report.json`,report=JSON.parse(readFileSync(file,'utf8'))
  if(report.errors?.length||!report.checks?.length)throw Error(`Failed/missing ${name} execution check`)
  validation[name]=report.checks.length
 }
 const info=`build-info-win-${version}.json`,sums=`SHA256SUMS-win-${version}.txt`
 const assets=await Promise.all([...files,manifest].map(async file=>({file,bytes:statSync(join('release',file)).size,sha256:await digest(join('release',file))})))
 writeFileSync(join('release',info),JSON.stringify({version,sourceCommit:revision,architecture:'x64',assets,validation,workflowRun:process.env.GITHUB_RUN_ID?`https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`:null},null,2)+'\n')
 writeFileSync(join('release',sums),assets.map(a=>`${a.sha256}  ${a.file}`).join('\n')+'\n')
 // Metadata is uploaded last, after every binary has been verified. Keep the
 // release a draft; publishing it is a separate, explicit release decision.
 for(const file of [...files,info,sums,manifest]){
  const path=join('release',file),expected=`sha256:${await digest(path)}`,existing=destination().assets.find(a=>a.name===file)
  if(existing){if(existing.digest!==expected)throw Error(`A different ${file} is already attached`);continue}
  gh(['release','upload',tag,path,'--repo',repository])
  const asset=destination().assets.find(a=>a.name===file)
  if(asset?.state!=='uploaded'||asset.digest!==expected)throw Error(`Uploaded ${file} did not match its checksum`)
 }
}
